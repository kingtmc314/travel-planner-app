import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  normalizeFlightLookupNumber,
  validFlightLookupDate,
  type FlightLookupCandidate,
} from "@shared/flightLookup";

export type FlightAutofillState = {
  identity: string;
  lastAuto: Record<string, string>;
  dirty: string[];
};

/** Invalid intermediate input still has an identity, so old routes are cleared immediately. */
export function flightAutofillIdentity(flightNumber: string, date: string) {
  return `${normalizeFlightLookupNumber(flightNumber) || flightNumber.trim().toUpperCase()}|${date}`;
}

export function flightLookupInput(flightNumber: string, date: string) {
  const number = normalizeFlightLookupNumber(flightNumber);
  return number && validFlightLookupDate(date)
    ? { flightNumber: number, date }
    : null;
}

export function createFlightAutofillState(
  identity: string
): FlightAutofillState {
  return { identity, lastAuto: {}, dirty: [] };
}

export function markFlightAutofillManual(
  state: FlightAutofillState,
  field: string
) {
  return {
    ...state,
    dirty: state.dirty.includes(field) ? state.dirty : [...state.dirty, field],
  };
}

function detectManualChanges<T extends object>(
  form: T,
  state: FlightAutofillState
) {
  let next = state;
  const fields = form as Record<string, unknown>;
  for (const [field, previous] of Object.entries(state.lastAuto)) {
    if (fields[field] !== previous)
      next = markFlightAutofillManual(next, field);
  }
  return next;
}

/** Only values owned by this session may be removed when the flight changes. */
export function clearFlightAutofillIdentity<T extends object>(
  form: T,
  state: FlightAutofillState,
  identity: string
): { form: T; state: FlightAutofillState } {
  state = detectManualChanges(form, state);
  if (identity === state.identity) return { form, state };
  const next = { ...form };
  const fields = next as Record<string, unknown>;
  for (const [field, previous] of Object.entries(state.lastAuto)) {
    if (!state.dirty.includes(field) && fields[field] === previous)
      fields[field] = "";
  }
  return {
    form: next,
    state: { ...state, identity, lastAuto: {} },
  };
}

/** An empty manually-cleared field is dirty too; blank is not permission to overwrite it. */
export function applyFlightAutofillValues<T extends object>(
  form: T,
  state: FlightAutofillState,
  values: Partial<Record<keyof T, string>>,
  protectedFields: readonly (keyof T)[] = []
): { form: T; state: FlightAutofillState; filled: string[] } {
  state = detectManualChanges(form, state);
  const next = { ...form };
  const fields = next as Record<string, unknown>;
  const lastAuto = { ...state.lastAuto };
  const filled: string[] = [];
  for (const [field, value] of Object.entries(values)) {
    if (
      typeof value !== "string" ||
      !value ||
      protectedFields.includes(field as keyof T)
    )
      continue;
    if (state.dirty.includes(field)) continue;
    const current = fields[field];
    const managed =
      Object.hasOwn(lastAuto, field) && current === lastAuto[field];
    if (current !== "" && current !== null && current !== undefined && !managed)
      continue;
    fields[field] = value;
    lastAuto[field] = value;
    filled.push(field);
  }
  return { form: next, state: { ...state, lastAuto }, filled };
}

export function candidateMatchesFlight(
  candidate: FlightLookupCandidate,
  flightNumber: string,
  date: string
) {
  const input = flightLookupInput(flightNumber, date);
  return Boolean(
    input &&
      normalizeFlightLookupNumber(candidate.flightNumber) ===
        input.flightNumber &&
      candidate.date === input.date
  );
}

export function canApplyFlightCandidate(
  candidate: FlightLookupCandidate,
  context: {
    flightNumber: string;
    date: string;
    open: boolean;
    authorized: boolean;
    sessionKey: string;
  },
  expectedSession: string
) {
  return (
    context.open &&
    context.authorized &&
    context.sessionKey === expectedSession &&
    candidateMatchesFlight(candidate, context.flightNumber, context.date)
  );
}

type FlightAutofillOptions<T extends object> = {
  form: T;
  setForm: Dispatch<SetStateAction<T>>;
  numberField: keyof T;
  dateField: keyof T;
  sessionKey: string;
  open: boolean;
  authorized: boolean;
  mapCandidate: (
    candidate: FlightLookupCandidate,
    form: T
  ) => Partial<Record<keyof T, string>>;
};

/** Each form reset gets a new sessionKey. No mutation or persistence happens here. */
export function useFlightAutofill<T extends object>(
  options: FlightAutofillOptions<T>
) {
  const latest = useRef(options);
  latest.current = options;
  const identity = flightAutofillIdentity(
    String(options.form[options.numberField]),
    String(options.form[options.dateField])
  );
  const session = useRef({
    key: options.sessionKey,
    state: createFlightAutofillState(identity),
  });
  if (session.current.key !== options.sessionKey) {
    session.current = {
      key: options.sessionKey,
      state: createFlightAutofillState(identity),
    };
  }

  const reconcile = useCallback((form: T, state: FlightAutofillState) => {
    const current = latest.current;
    const nextIdentity = flightAutofillIdentity(
      String(form[current.numberField]),
      String(form[current.dateField])
    );
    const result = clearFlightAutofillIdentity(form, state, nextIdentity);
    session.current.state = result.state;
    return result;
  }, []);

  // Covers external changes too. Form handlers use change() to clear in the same state update.
  useEffect(() => {
    if (!options.open || session.current.state.identity === identity) return;
    const snapshot = session.current.state;
    options.setForm(previous => reconcile(previous, snapshot).form);
  }, [identity, options.open, options.sessionKey, options.setForm, reconcile]);

  const change = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      const current = latest.current;
      session.current.state = markFlightAutofillManual(
        session.current.state,
        String(field)
      );
      const snapshot = session.current.state;
      current.setForm(
        previous => reconcile({ ...previous, [field]: value }, snapshot).form
      );
    },
    [reconcile]
  );

  const canManage = useCallback((field: keyof T) => {
    const current = latest.current;
    const state = session.current.state;
    const value = current.form[field];
    return (
      !state.dirty.includes(String(field)) &&
      (value === "" ||
        value === null ||
        value === undefined ||
        (Object.hasOwn(state.lastAuto, field) &&
          value === state.lastAuto[String(field)]))
    );
  }, []);

  const trackEstimate = useCallback((field: keyof T, value: string) => {
    const state = session.current.state;
    if (!state.dirty.includes(String(field)) && value) {
      session.current.state = {
        ...state,
        lastAuto: { ...state.lastAuto, [String(field)]: value },
      };
    }
  }, []);

  const applyValues = useCallback(
    (
      values: Partial<Record<keyof T, string>>,
      expectedSession = latest.current.sessionKey
    ) => {
      const current = latest.current;
      if (
        !current.open ||
        !current.authorized ||
        current.sessionKey !== expectedSession
      )
        return;
      const snapshot = session.current.state;
      current.setForm(previous => {
        if (
          !latest.current.open ||
          !latest.current.authorized ||
          latest.current.sessionKey !== expectedSession
        )
          return previous;
        const reconciled = reconcile(previous, snapshot);
        const result = applyFlightAutofillValues(
          reconciled.form,
          reconciled.state,
          values,
          [current.numberField, current.dateField]
        );
        session.current.state = result.state;
        return result.form;
      });
    },
    [reconcile]
  );

  const applyCandidate = useCallback(
    (candidate: FlightLookupCandidate) => {
      const current = latest.current;
      const expectedSession = current.sessionKey;
      if (
        !current.open ||
        !current.authorized ||
        !candidateMatchesFlight(
          candidate,
          String(current.form[current.numberField]),
          String(current.form[current.dateField])
        )
      )
        return;
      const snapshot = session.current.state;
      current.setForm(previous => {
        const active = latest.current;
        if (
          !canApplyFlightCandidate(
            candidate,
            {
              ...active,
              flightNumber: String(previous[active.numberField]),
              date: String(previous[active.dateField]),
            },
            expectedSession
          )
        )
          return previous;
        const reconciled = reconcile(previous, snapshot);
        const result = applyFlightAutofillValues(
          reconciled.form,
          reconciled.state,
          active.mapCandidate(candidate, reconciled.form),
          [active.numberField, active.dateField]
        );
        session.current.state = result.state;
        return result.form;
      });
    },
    [reconcile]
  );

  return { change, canManage, trackEstimate, applyValues, applyCandidate };
}
