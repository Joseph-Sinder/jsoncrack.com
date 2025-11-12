import { create } from "zustand";
import useGraph from "../features/editor/views/GraphView/stores/useGraph";
import useFile from "./useFile";

interface JsonActions {
  setJson: (json: string) => void;
  getJson: () => string;
  clear: () => void;
}

const initialStates = {
  json: "{}",
  loading: true,
};

export type JsonStates = typeof initialStates;

const useJson = create<JsonStates & JsonActions>()((set, get) => ({
  ...initialStates,
  getJson: () => get().json,
  setJson: json => {
    set({ json, loading: false });
    // update graph view
    useGraph.getState().setGraph(json);
    // also update editor contents so sidebar / text editor reflects changes immediately
    try {
      // directly set file contents without triggering setContents logic to avoid loops
      // make sure the contents are pretty-printed so the editor/sidebar show multiline content
      let formatted = json;
      try {
        const parsed = JSON.parse(json);
        formatted = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // if parsing fails, fall back to raw string
        formatted = json;
      }

      useFile.setState({ contents: formatted, hasChanges: false });
    } catch (e) {
      // noop
    }
  },
  clear: () => {
    set({ json: "", loading: false });
    useGraph.getState().clearGraph();
  },
}));

export default useJson;
