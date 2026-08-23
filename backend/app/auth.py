import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


load_dotenv()


router = APIRouter(
    prefix="/auth",
    tags=["Merchant Authentication"],
)


JWT_ALGORITHM = "HS256"
JWT_ISSUER = "recoverpay-ai"
TOKEN_EXPIRE_HOURS = 8


# =========================================================
# SCHEMAS
# =========================================================

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    admin: dict


# =========================================================
# CONFIG
# =========================================================

def get_auth_config():
    admin_email = os.getenv("MERCHANT_ADMIN_EMAIL")
    password_hash = os.getenv("MERCHANT_ADMIN_PASSWORD_HASH")
    jwt_secret = os.getenv("JWT_SECRET")

    if not admin_email:
        raise RuntimeError(
            "MERCHANT_ADMIN_EMAIL is not configured."
        )

    if not password_hash:
        raise RuntimeError(
            "MERCHANT_ADMIN_PASSWORD_HASH is not configured."
        )

    if not jwt_secret:
        raise RuntimeError(
            "JWT_SECRET is not configured."
        )

    return (
        admin_email.strip(),
        password_hash.strip(),
        jwt_secret.strip(),
    )


# =========================================================
# PASSWORD VERIFICATION
# =========================================================

def verify_password(
    password: str,
    stored_hash: str,
) -> bool:
    """
    Expected format:

    iterations$salt_hex$hash_hex
    """

    try:
        iterations_text, salt_hex, expected_hex = (
            stored_hash.split("$", 2)
        )

        iterations = int(iterations_text)

        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(expected_hex)

        calculated_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )

        return hmac.compare_digest(
            calculated_hash,
            expected_hash,
        )

    except (
        ValueError,
        TypeError,
    ):
        return False


# =========================================================
# JWT
# =========================================================

def create_access_token(email: str) -> str:
    _, _, jwt_secret = get_auth_config()

    now = datetime.now(timezone.utc)

    expires_at = now + timedelta(
        hours=TOKEN_EXPIRE_HOURS
    )

    payload = {
        "sub": email,
        "role": "merchant_admin",
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        jwt_secret,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    _, _, jwt_secret = get_auth_config()

    return jwt.decode(
        token,
        jwt_secret,
        algorithms=[JWT_ALGORITHM],
        issuer=JWT_ISSUER,
    )


# =========================================================
# LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=LoginResponse,
)
def login(payload: LoginRequest):
    try:
        admin_email, password_hash, _ = (
            get_auth_config()
        )

    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )


    entered_email = (
        payload.email
        .strip()
        .lower()
    )

    configured_email = (
        admin_email
        .strip()
        .lower()
    )


    email_valid = hmac.compare_digest(
        entered_email,
        configured_email,
    )

    password_valid = verify_password(
        payload.password,
        password_hash,
    )


    if not email_valid or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid merchant admin credentials.",
        )


    access_token = create_access_token(
        configured_email
    )


    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": TOKEN_EXPIRE_HOURS * 60 * 60,
        "admin": {
            "email": configured_email,
            "role": "merchant_admin",
        },
    }


# =========================================================
# CURRENT ADMIN
# =========================================================

@router.get("/me")
def get_current_admin(request: Request):
    user = getattr(
        request.state,
        "user",
        None,
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    return {
        "email": user.get("sub"),
        "role": user.get("role"),
    }


# =========================================================
# PUBLIC ROUTES
# =========================================================

def is_public_route(
    request: Request,
) -> bool:

    # CORS preflight must always pass.
    if request.method == "OPTIONS":
        return True


    path = request.url.path

    normalized = (
        path.rstrip("/")
        if path != "/"
        else "/"
    )


    public_exact = {
        "/",
        "/health",
        "/auth/login",

        # Razorpay must be able to call this without JWT.
        # Security is handled through Razorpay HMAC signature.
        "/razorpay/webhook",

        "/openapi.json",
        "/favicon.ico",
    }


    if normalized in public_exact:
        return True


    if normalized.startswith("/docs"):
        return True


    if normalized.startswith("/redoc"):
        return True


    return False


# =========================================================
# AUTHENTICATION MIDDLEWARE
# =========================================================

async def merchant_auth_middleware(
    request: Request,
    call_next,
):

    if is_public_route(request):
        return await call_next(request)


    authorization = request.headers.get(
        "Authorization",
        "",
    )


    if not authorization.startswith(
        "Bearer "
    ):
        return JSONResponse(
            status_code=401,
            content={
                "detail":
                    "Merchant authentication required."
            },
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )


    token = (
        authorization
        .split(" ", 1)[1]
        .strip()
    )


    if not token:
        return JSONResponse(
            status_code=401,
            content={
                "detail":
                    "Merchant authentication required."
            },
        )


    try:
        payload = decode_access_token(
            token
        )


        if (
            payload.get("role")
            != "merchant_admin"
        ):
            raise jwt.InvalidTokenError(
                "Invalid role."
            )


        request.state.user = payload


    except jwt.ExpiredSignatureError:

        return JSONResponse(
            status_code=401,
            content={
                "detail":
                    "Merchant session expired."
            },
        )


    except jwt.InvalidTokenError:

        return JSONResponse(
            status_code=401,
            content={
                "detail":
                    "Invalid merchant session."
            },
        )


    except RuntimeError as exc:

        return JSONResponse(
            status_code=503,
            content={
                "detail": str(exc)
            },
        )


    return await call_next(request)