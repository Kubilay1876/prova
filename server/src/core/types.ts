export type EventKind =
  | "EXAMINER_DECISION"
  | "MODEL_ACTION"
  | "TOOL_REQUEST"
  | "TOOL_RESPONSE"
  | "LEDGER_EVENT"
  | "GATE_DECISION"
  | "TEST_RESULT"
  | "RUN_STATUS";

export type Actor = "EXAMINER" | "CANDIDATE" | "ATK" | "GATE" | "EXCHANGE" | "EVALUATOR" | "SYSTEM";

// Shape follows docs/API.md "event".
export interface RunEvent {
  id: string;
  runId: string;
  seq: number;
  timestamp: string;
  testId: string | null;
  kind: EventKind;
  actor: Actor;
  summary: string;
  payload: Record<string, unknown>;
}

export type NewEvent = Pick<RunEvent, "testId" | "kind" | "actor" | "summary" | "payload">;

export type TestStatus =
  | "PENDING"
  | "RUNNING"
  | "PASS"
  | "FAIL"
  | "INCONCLUSIVE"
  | "ERROR"
  | "NOT_TRIGGERED"
  | "UNSUPPORTED"
  | "CANCELLED";

export interface Finding {
  id: string;
  testId: string;
  ruleId: string;
  severity: "CRITICAL" | "HIGH" | "FUNCTIONAL";
  title: string;
  observed: string;
  expected: string;
  evidenceEventIds: string[];
}

export interface TestOutcome {
  testId: string;
  testStatus: TestStatus;
  reason: string;
  evidenceEventIds: string[];
  findings: Finding[];
}
