import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getGlobalAuditTrail,
} from "../api";

import {
  formatText,
} from "../utils";


function AuditTrailPage() {

  const [logs, setLogs] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [eventFilter, setEventFilter] =
    useState("all");


  const loadAuditLogs =
    async () => {

      try {

        setLoading(true);

        const data =
          await getGlobalAuditTrail(
            null,
            null,
            500
          );

        setLogs(
          data.audit_logs || []
        );

      } catch (error) {

        console.error(
          "Audit loading error:",
          error
        );

      } finally {

        setLoading(false);

      }
    };


  useEffect(() => {
    loadAuditLogs();
  }, []);


  const eventTypes =
    useMemo(
      () => [
        ...new Set(
          logs.map(
            (log) => log.event
          )
        ),
      ],
      [logs]
    );


  const filteredLogs =
    useMemo(
      () => {

        const term =
          search
            .trim()
            .toLowerCase();


        return logs.filter(
          (log) => {

            const matchesSearch =
              !term ||
              log
                .transaction_id
                .toLowerCase()
                .includes(term) ||
              log
                .message
                .toLowerCase()
                .includes(term);


            const matchesEvent =
              eventFilter === "all" ||
              log.event ===
                eventFilter;


            return (
              matchesSearch &&
              matchesEvent
            );

          }
        );

      },
      [
        logs,
        search,
        eventFilter,
      ]
    );


  return (

    <div>

      <div className="page-heading">

        <div>

          <p className="eyebrow">
            TRACEABLE AI OPERATIONS
          </p>

          <h1>
            Audit Trail
          </h1>

          <p className="subtitle">
            Chronological record of
            payment failures, AI
            recommendations, policy
            validation, recovery attempts
            and escalations.
          </p>

        </div>

      </div>


      <div className="filter-bar">

        <div className="search-box">

          <Search size={17} />

          <input
            type="text"
            placeholder="Search transaction or audit message..."
            value={search}
            onChange={
              (event) =>
                setSearch(
                  event.target.value
                )
            }
          />

        </div>


        <div className="filter-control">

          <select
            value={eventFilter}
            onChange={
              (event) =>
                setEventFilter(
                  event.target.value
                )
            }
          >

            <option value="all">
              All events
            </option>

            {
              eventTypes.map(
                (event) => (

                  <option
                    key={event}
                    value={event}
                  >
                    {
                      formatText(
                        event
                      )
                    }
                  </option>

                )
              )
            }

          </select>

        </div>

      </div>


      {
        loading
          ? (

            <div className="audit-loading">
              Loading global audit
              trail...
            </div>

          )
          : (

            <section className="global-audit-card">

              {
                filteredLogs.map(
                  (log) => (

                    <GlobalAuditRow
                      key={log.id}
                      log={log}
                    />

                  )
                )
              }

            </section>

          )
      }

    </div>
  );
}


function GlobalAuditRow({
  log,
}) {

  const getIcon = () => {

    if (
      log.event ===
      "AI_DECISION_GENERATED"
    ) {
      return (
        <BrainCircuit
          size={16}
        />
      );
    }

    if (
      log.event ===
        "POLICY_VALIDATED" ||
      log.event ===
        "POLICY_OVERRIDE"
    ) {
      return (
        <ShieldCheck
          size={16}
        />
      );
    }

    if (
      log.event ===
      "RECOVERY_SUCCESS"
    ) {
      return (
        <CheckCircle2
          size={16}
        />
      );
    }

    if (
      log.event ===
        "RECOVERY_STOPPED" ||
      log.event ===
        "HUMAN_ESCALATION"
    ) {
      return (
        <ShieldAlert
          size={16}
        />
      );
    }

    if (
      log.event ===
      "PAYMENT_FAILED"
    ) {
      return (
        <AlertTriangle
          size={16}
        />
      );
    }

    return (
      <Clock3 size={16} />
    );
  };


  return (

    <div className="global-audit-row">

      <div className="audit-event-icon">
        {getIcon()}
      </div>


      <div className="global-audit-main">

        <div className="global-audit-top">

          <strong>
            {
              formatText(
                log.event
              )
            }
          </strong>

          <span className="transaction-id">
            {
              log.transaction_id
            }
          </span>

        </div>


        <p>
          {log.message}
        </p>


        {
          log.created_at && (

            <span className="audit-time">
              {
                new Date(
                  log.created_at
                ).toLocaleString()
              }
            </span>

          )
        }

      </div>

    </div>

  );
}


export default AuditTrailPage;