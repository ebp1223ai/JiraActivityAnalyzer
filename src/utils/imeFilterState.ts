export type ImeFilterState = {
  draft: string;
  composing: boolean;
  revision: number;
};

export type ImeFilterAction =
  | { type: "external"; value: unknown }
  | { type: "composition-start" }
  | { type: "composition-update"; value: unknown }
  | { type: "composition-end"; value: unknown }
  | { type: "input"; value: unknown };

function primitive(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function createImeFilterState(value: unknown): ImeFilterState {
  return { draft: primitive(value), composing: false, revision: 0 };
}

export function reduceImeFilterState(state: ImeFilterState, action: ImeFilterAction): ImeFilterState {
  if (action.type === "composition-start") return { ...state, composing: true };
  if (action.type === "composition-update") return { ...state, draft: primitive(action.value), composing: true };
  if (action.type === "composition-end") {
    return { draft: primitive(action.value), composing: false, revision: state.revision + 1 };
  }
  if (action.type === "input") {
    return {
      draft: primitive(action.value),
      composing: state.composing,
      revision: state.composing ? state.revision : state.revision + 1
    };
  }
  if (state.composing) return state;
  const draft = primitive(action.value);
  return draft === state.draft ? state : { draft, composing: false, revision: state.revision };
}
