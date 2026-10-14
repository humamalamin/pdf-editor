import { useCallback, useReducer, type SetStateAction } from "react";

const MAX_HISTORY = 100;

type History<T> = { past: T[]; present: T; future: T[] };

type Action<T> =
  | { type: "set"; update: SetStateAction<T> }
  | { type: "checkpoint" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

function reducer<T>(state: History<T>, action: Action<T>): History<T> {
  switch (action.type) {
    case "set": {
      const present =
        typeof action.update === "function"
          ? (action.update as (prev: T) => T)(state.present)
          : action.update;
      return present === state.present ? state : { ...state, present };
    }
    case "checkpoint":
      if (state.past[state.past.length - 1] === state.present) return state;
      return { past: [...state.past.slice(-(MAX_HISTORY - 1)), state.present], present: state.present, future: [] };
    case "undo": {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
    }
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

// State with explicit undo checkpoints: call `checkpoint()` right before a user action, then
// `set()` as often as needed (e.g. every keystroke or resize frame) — it all undoes as one step.
export function useUndoable<T>(initial: T) {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [] });

  return {
    value: state.present,
    set: useCallback((update: SetStateAction<T>) => dispatch({ type: "set", update }), []),
    checkpoint: useCallback(() => dispatch({ type: "checkpoint" }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    reset: useCallback((value: T) => dispatch({ type: "reset", value }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
