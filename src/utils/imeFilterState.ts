export type ImeFilterState = {
  draft: string;
  composing: boolean;
  revision: number;
  draftValue: string;
  committedValue: string;
  isComposing: boolean;
  pendingCommit: string | null;
  suppressNextInput: boolean;
};

export type ImeFilterAction =
  | { type: "external"; value: unknown }
  | { type: "composition-start" }
  | { type: "composition-update"; value: unknown }
  | { type: "composition-end"; value: unknown }
  | { type: "input"; value: unknown }
  | { type: "commit-applied"; value: unknown }
  | { type: "revert" };

function primitive(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function createImeFilterState(value: unknown): ImeFilterState {
  const initialValue = primitive(value);
  return {
    draft: initialValue,
    composing: false,
    revision: 0,
    draftValue: initialValue,
    committedValue: initialValue,
    isComposing: false,
    pendingCommit: null,
    suppressNextInput: false
  };
}

export function reduceImeFilterState(state: ImeFilterState, action: ImeFilterAction): ImeFilterState {
  if (action.type === "composition-start") {
    return { ...state, composing: true, isComposing: true, suppressNextInput: false };
  }
  if (action.type === "composition-update") {
    const draftValue = primitive(action.value);
    return { ...state, draft: draftValue, draftValue, composing: true, isComposing: true };
  }
  if (action.type === "composition-end") {
    const draftValue = primitive(action.value);
    return {
      ...state,
      draft: draftValue,
      draftValue,
      composing: false,
      isComposing: false,
      pendingCommit: draftValue,
      suppressNextInput: true,
      revision: state.revision + 1
    };
  }
  if (action.type === "input") {
    const draftValue = primitive(action.value);
    if (state.suppressNextInput && draftValue === state.draftValue) {
      return { ...state, suppressNextInput: false };
    }
    return {
      ...state,
      draft: draftValue,
      draftValue,
      composing: state.composing,
      isComposing: state.isComposing,
      pendingCommit: state.isComposing ? state.pendingCommit : draftValue,
      suppressNextInput: false,
      revision: state.composing ? state.revision : state.revision + 1
    };
  }
  if (action.type === "commit-applied") {
    const committedValue = primitive(action.value);
    return {
      ...state,
      committedValue,
      pendingCommit: state.pendingCommit === committedValue ? null : state.pendingCommit,
      suppressNextInput: false
    };
  }
  if (action.type === "revert") {
    return {
      ...state,
      draft: state.committedValue,
      draftValue: state.committedValue,
      composing: false,
      isComposing: false,
      pendingCommit: null,
      suppressNextInput: false
    };
  }
  if (state.isComposing || state.pendingCommit !== null) return state;
  const externalValue = primitive(action.value);
  if (externalValue === state.committedValue && externalValue === state.draftValue) return state;
  return {
    ...state,
    draft: externalValue,
    draftValue: externalValue,
    committedValue: externalValue,
    composing: false,
    isComposing: false,
    suppressNextInput: false
  };
}