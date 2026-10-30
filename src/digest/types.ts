// Plan morning-digest § 1. The contract section 2 builds on: one row per job in a night's run log.

export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** null when the log line had `owner: null`; views render it as `—`. */
  owner: string | null;
  /** Lines for this job, any status. */
  runs: number;
  /** Lines for this job with status `retry`. */
  retries: number;
  lastStatus: RunStatus;
  /** `error` of the last line for this job that had one, or null. */
  lastError: string | null;
  /** `at` of the first and last line for this job, offset kept as logged. */
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  /** Sorted by job. Empty when the file is empty. */
  rows: DigestRow[];
  /** Lines that did not parse as a run line. Counted, never thrown. */
  badLines: number;
};

/** Reads `<runsDir>/<night>.jsonl`. Returns null when there is no file for that night. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
