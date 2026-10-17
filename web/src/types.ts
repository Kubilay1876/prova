export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
export type Status = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'CANCELLED' | 'ERROR';
export type TestStatus = 'PENDING' | 'RUNNING' | Verdict | 'ERROR' | 'NOT_TRIGGERED' | 'UNSUPPORTED' | 'CANCELLED';
export interface Capability { status: 'NOT_CONFIGURED' | 'VERIFIED' | 'ERROR'; checkedAt: string | null; message: string }
export interface Health { apiVersion: '1'; serverTime: string; capabilities: Record<'atkMarket' | 'atkExam' | 'llm' | 'chain', Capability> }
export interface Candidate { id: string; label: string; versionHash: string | null; provenance: 'TEAM_DEMO' | 'EXTERNAL'; supportedTestIds: string[] }
export interface TestDefinition { id: string; title: string; description: string; required: boolean; supported: boolean; unsupportedReason: string | null }
export interface TestResult { testId: string; testStatus: TestStatus; reason: string; evidenceEventIds: string[] }
export interface Finding { id: string; testId: string; ruleId: string; severity: 'CRITICAL' | 'HIGH' | 'FUNCTIONAL'; title: string; observed: string; expected: string; evidenceEventIds: string[] }
export interface RunEvent { id: string; runId: string; seq: number; timestamp: string; testId: string | null; kind: 'EXAMINER_DECISION' | 'MODEL_ACTION' | 'TOOL_REQUEST' | 'TOOL_RESPONSE' | 'LEDGER_EVENT' | 'GATE_DECISION' | 'TEST_RESULT' | 'RUN_STATUS'; actor: 'EXAMINER' | 'CANDIDATE' | 'ATK' | 'GATE' | 'EXCHANGE' | 'EVALUATOR' | 'SYSTEM'; summary: string; payload: Record<string, unknown> }
export interface RunSummary { id: string; candidateId: string; candidateVersionHash: string | null; status: Status; verdict: Verdict | null; startedAt: string | null }
export interface Run extends RunSummary {
  cancelRequested: boolean; endedAt: string | null; suiteHash: string | null; fixtureHash: string | null; policyHash: string | null;
  selectedTestIds: string[]; tests: TestResult[]; findings: Finding[];
  counts: { requiredTotal: number; requiredPassed: number; requiredFailed: number; requiredResolved: number; modelCalls: number; toolCalls: number; attemptedViolations: number; blockedEffects: number };
  reality: { toolOrigin: 'ATK_MCP' | 'UNVERIFIED'; marketSource: 'LIVE' | 'CAPTURED' | 'SYNTHETIC' | 'MODIFIED_MARKET'; execution: 'SIMULATED' | 'NONE'; network: 'NONE' | 'FUJI' };
  credentialStatus: 'LOCAL_ONLY' | 'PENDING' | 'FUJI_VERIFIED' | 'ERROR';
  receipt: null | { chainId: number; contractAddress: string; txHash: string; recorderAddress: string; verificationStatus: 'PENDING' | 'VERIFIED' | 'ERROR'; blockNumber?: string; observedConfirmationMs?: number | null };
  reportHash: null | { algorithm: 'sha256'; value: string };
}
export interface EventsResponse { apiVersion: '1'; events: RunEvent[]; lastSeq: number }
export interface Api {
  health(): Promise<Health>; candidates(): Promise<Candidate[]>; tests(): Promise<{ suiteVersion: string; tests: TestDefinition[] }>;
  runs(): Promise<RunSummary[]>; run(id: string): Promise<Run>; events(id: string, after: number): Promise<EventsResponse>;
  start(requestId: string, candidateId: string, testIds: string[]): Promise<{ runId: string; status: Status }>;
  cancel(id: string): Promise<{ runId: string; status: Status }>; report(id: string): Promise<Blob>;
}
