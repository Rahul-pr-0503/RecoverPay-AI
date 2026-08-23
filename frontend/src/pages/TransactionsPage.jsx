import {
  Search,
  SlidersHorizontal,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import {
  formatCurrency,
  formatText,
} from "../utils";


function TransactionsPage({
  transactions,
  onOpenTransaction,
}) {

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [failureFilter, setFailureFilter] =
    useState("all");


  const failureReasons =
    useMemo(() => {

      return [
        ...new Set(
          transactions
            .map(
              (transaction) =>
                transaction.failure_reason
            )
            .filter(Boolean)
        ),
      ];

    }, [transactions]);


  const filteredTransactions =
    useMemo(() => {

      return transactions.filter(
        (transaction) => {

          const searchTerm =
            search
              .trim()
              .toLowerCase();


          const matchesSearch =
            !searchTerm ||
            transaction
              .transaction_id
              .toLowerCase()
              .includes(searchTerm) ||
            (
              transaction
                .payment_method || ""
            )
              .toLowerCase()
              .includes(searchTerm) ||
            (
              transaction
                .failure_reason || ""
            )
              .toLowerCase()
              .includes(searchTerm);


          const matchesStatus =
            statusFilter === "all" ||
            transaction.status ===
              statusFilter;


          const matchesFailure =
            failureFilter === "all" ||
            transaction.failure_reason ===
              failureFilter;


          return (
            matchesSearch &&
            matchesStatus &&
            matchesFailure
          );

        }
      );

    }, [
      transactions,
      search,
      statusFilter,
      failureFilter,
    ]);


  return (

    <div>

      <div className="page-heading">

        <div>

          <p className="eyebrow">
            TRANSACTION INTELLIGENCE
          </p>

          <h1>
            Transactions
          </h1>

          <p className="subtitle">
            Search, filter and inspect
            every payment processed by
            RecoverPay AI.
          </p>

        </div>

      </div>


      <div className="filter-bar">

        <div className="search-box">

          <Search size={17} />

          <input
            type="text"
            placeholder="Search transaction ID, method or failure..."
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

          <SlidersHorizontal
            size={16}
          />

          <select
            value={statusFilter}
            onChange={
              (event) =>
                setStatusFilter(
                  event.target.value
                )
            }
          >

            <option value="all">
              All statuses
            </option>

            <option value="success">
              Success
            </option>

            <option value="at_risk">
              At Risk
            </option>

            <option value="recovery_pending">
              Recovery Pending
            </option>

            <option value="recovered">
              Recovered
            </option>

            <option value="escalated">
              Escalated
            </option>

          </select>

        </div>


        <div className="filter-control">

          <select
            value={failureFilter}
            onChange={
              (event) =>
                setFailureFilter(
                  event.target.value
                )
            }
          >

            <option value="all">
              All failure reasons
            </option>

            {
              failureReasons.map(
                (reason) => (

                  <option
                    key={reason}
                    value={reason}
                  >
                    {formatText(reason)}
                  </option>

                )
              )
            }

          </select>

        </div>

      </div>


      <div className="table-summary">

        Showing{" "}
        <strong>
          {filteredTransactions.length}
        </strong>{" "}
        of{" "}
        <strong>
          {transactions.length}
        </strong>{" "}
        transactions

      </div>


      <section className="content-card">

        <div className="table-wrapper">

          <table>

            <thead>

              <tr>
                <th>Transaction</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Failure</th>
                <th>Recovery Action</th>
                <th>Attempts</th>
                <th>Status</th>
              </tr>

            </thead>


            <tbody>

              {
                filteredTransactions.map(
                  (transaction) => (

                    <tr
                      key={
                        transaction.transaction_id
                      }
                      className="clickable-row"
                      onClick={() =>
                        onOpenTransaction(
                          transaction
                        )
                      }
                    >

                      <td className="transaction-id">
                        {
                          transaction.transaction_id
                        }
                      </td>

                      <td>
                        {
                          formatCurrency(
                            transaction.amount
                          )
                        }
                      </td>

                      <td>
                        {
                          formatText(
                            transaction.payment_method
                          )
                        }
                      </td>

                      <td>
                        {
                          formatText(
                            transaction.failure_reason
                          )
                        }
                      </td>

                      <td>
                        {
                          formatText(
                            transaction.recovery_action
                          )
                        }
                      </td>

                      <td>
                        {
                          transaction.retry_count
                        }
                        /
                        {
                          transaction.max_retries
                        }
                      </td>

                      <td>

                        <span
                          className={
                            `status status-${transaction.status}`
                          }
                        >
                          {
                            formatText(
                              transaction.status
                            )
                          }
                        </span>

                      </td>

                    </tr>

                  )
                )
              }

            </tbody>

          </table>

        </div>

      </section>

    </div>
  );
}


export default TransactionsPage;