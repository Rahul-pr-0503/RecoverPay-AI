import {
  Bot,
  BrainCircuit,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

import {
  formatCurrency,
  formatText,
} from "../utils";


function RecoveryAgentPage({
  transactions,
  metrics,
  agentRunning,
  agentMessage,
  onRunAgent,
}) {

  const failed =
    transactions.filter(
      (transaction) =>
        transaction.failure_reason
    );


  const recovered =
    failed.filter(
      (transaction) =>
        transaction.recovered
    );


  const escalated =
    failed.filter(
      (transaction) =>
        transaction.status ===
        "escalated"
    );


  const pending =
    failed.filter(
      (transaction) =>
        transaction.status ===
          "at_risk" ||
        transaction.status ===
          "recovery_pending"
    );


  const actionCounts = {};


  failed.forEach(
    (transaction) => {

      if (!transaction.recovery_action) {
        return;
      }

      const action =
        transaction.recovery_action;

      actionCounts[action] =
        (
          actionCounts[action] || 0
        ) + 1;

    }
  );


  return (

    <div>

      <div className="page-heading recovery-page-header">

        <div>

          <p className="eyebrow">
            GUARDED AGENTIC WORKFLOW
          </p>

          <h1>
            Recovery Agent
          </h1>

          <p className="subtitle">
            Groq diagnoses payment
            failures while RecoverPay
            validates every action using
            deterministic backend
            guardrails.
          </p>

        </div>


        <button
          className="agent-button"
          disabled={
            agentRunning ||
            pending.length === 0
          }
          onClick={
            onRunAgent
          }
        >

          {
            agentRunning
              ? (
                <RefreshCw
                  className="spin"
                  size={17}
                />
              )
              : (
                <Play size={17} />
              )
          }

          {
            agentRunning
              ? "Running Agent..."
              : "Run Recovery Agent"
          }

        </button>

      </div>


      {
        agentMessage && (

          <div className="agent-message">

            <Bot size={18} />

            {agentMessage}

          </div>

        )
      }


      <section className="agent-stats-grid">

        <AgentStat
          icon={<BrainCircuit />}
          label="At-Risk Payments"
          value={
            failed.length
          }
          subtext={
            formatCurrency(
              metrics.revenue_at_risk
            )
          }
        />


        <AgentStat
          icon={<TrendingUp />}
          label="Recovered"
          value={
            recovered.length
          }
          subtext={
            formatCurrency(
              metrics.revenue_recovered
            )
          }
        />


        <AgentStat
          icon={<ShieldAlert />}
          label="Escalated"
          value={
            escalated.length
          }
          subtext="Human review"
        />


        <AgentStat
          icon={<ShieldCheck />}
          label="Pending"
          value={
            pending.length
          }
          subtext="Awaiting agent action"
        />

      </section>


      <section className="agent-workflow-card">

        <h2>
          Agent Workflow
        </h2>

        <div className="workflow-row">

          <WorkflowNode
            number="01"
            title="Detect"
            text="Identify revenue at risk"
          />

          <WorkflowArrow />

          <WorkflowNode
            number="02"
            title="Diagnose"
            text="Groq analyses failure context"
          />

          <WorkflowArrow />

          <WorkflowNode
            number="03"
            title="Validate"
            text="Policy engine checks AI action"
          />

          <WorkflowArrow />

          <WorkflowNode
            number="04"
            title="Act"
            text="Execute bounded recovery"
          />

          <WorkflowArrow />

          <WorkflowNode
            number="05"
            title="Measure"
            text="Track money recovered"
          />

        </div>

      </section>


      <section className="strategy-card">

        <div className="section-header">

          <div>

            <h2>
              Decision Statistics
            </h2>

            <p>
              Approved recovery actions
              across the current batch
            </p>

          </div>

        </div>


        <div className="strategy-list">

          {
            Object.entries(
              actionCounts
            ).length === 0
              ? (
                <p className="empty-state">
                  No recovery decisions
                  generated yet.
                </p>
              )
              : Object.entries(
                  actionCounts
                ).map(
                  ([action, count]) => (

                    <div
                      className="strategy-row"
                      key={action}
                    >

                      <span>
                        {
                          formatText(
                            action
                          )
                        }
                      </span>

                      <strong>
                        {count}
                      </strong>

                    </div>

                  )
                )
          }

        </div>

      </section>

    </div>
  );
}


function AgentStat({
  icon,
  label,
  value,
  subtext,
}) {

  return (

    <div className="metric-card">

      <div className="metric-top">

        <span>
          {label}
        </span>

        <div className="metric-icon">
          {icon}
        </div>

      </div>

      <h2>
        {value}
      </h2>

      <p>
        {subtext}
      </p>

    </div>

  );
}


function WorkflowNode({
  number,
  title,
  text,
}) {

  return (

    <div className="workflow-node">

      <span className="workflow-number">
        {number}
      </span>

      <strong>
        {title}
      </strong>

      <p>
        {text}
      </p>

    </div>

  );
}


function WorkflowArrow() {
  return (
    <span className="workflow-arrow">
      →
    </span>
  );
}


export default RecoveryAgentPage;