import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";
import { modify, applyEdits } from "jsonc-parser";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setJson = useJson(state => state.setJson);
  const getJson = useJson.getState().getJson;

  const [isEditing, setIsEditing] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState<string>("{}");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEditedContent(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
    setError(null);
  }, [nodeData, opened]);

  // set value at a JSONPath (array of keys/indexes)
  const setValueAtPath = (obj: any, path: NodeData["path"], value: any) => {
    if (!path || path.length === 0) return value;
    // clone shallow to avoid mutating original root reference
    let target = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i] as string | number;
      if (typeof key === "number") {
        if (!Array.isArray(target)) target = target[key] = [];
        else if (target[key] === undefined) target[key] = {};
        target = target[key];
      } else {
        if (target[key] === undefined || target[key] === null) target[key] = {};
        target = target[key];
      }
    }
    const last = path[path.length - 1] as string | number;
    target[last as any] = value;
    return obj;
  };

  const handleSave = () => {
    setError(null);
    if (!nodeData) return;
    try {
      // parse edited content as JSON (could be primitive, object or array)
      const parsed = JSON.parse(editedContent);

      // try to apply a minimal textual edit to the original document so we only change the
      // exact value the user edited (preserves formatting of the rest of the document)
      const original = useFile.getState().contents || getJson();
      const path = nodeData?.path ?? [];

      try {
        // compute existing value at path so we can merge edited fields instead of overwriting
        const rootJson = JSON.parse(getJson());
        let existing: any = rootJson;
        for (const seg of path || []) {
          if (existing == null) break;
          existing = existing[seg as any];
        }

        let valueToWrite = parsed;
        // If existing is an object (and not array) and parsed is an object, merge shallowly so
        // children/unknown attributes are preserved.
        if (
          existing &&
          typeof existing === "object" &&
          !Array.isArray(existing) &&
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          valueToWrite = { ...existing, ...parsed };
        }

        const edits = modify(original, path as any[], valueToWrite, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        });
        const newContent = applyEdits(original, edits);
        // update both editor contents and global json/graph
        setJson(newContent);
        useFile.setState({ contents: newContent, hasChanges: false });
        setIsEditing(false);
        onClose?.();
        return;
      } catch (e) {
        // fallback to full-replace if jsonc-parser fails
      }

      // fallback: update by replacing the value in the parsed root and stringifying
      const rootJson = JSON.parse(getJson());
      const updatedRoot = JSON.parse(JSON.stringify(rootJson)); // deep clone
      const newRoot = setValueAtPath(updatedRoot, nodeData.path, parsed);
      setJson(JSON.stringify(newRoot));
      setIsEditing(false);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleCancel = () => {
    setEditedContent(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
    setError(null);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {!isEditing ? (
                <Button size="xs" color="blue" variant="light" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              ) : (
                <>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" color="gray" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                value={editedContent}
                onChange={e => setEditedContent(e.currentTarget.value)}
                minRows={6}
                maw={600}
                autosize
                styles={{ input: { fontFamily: "monospace" } }}
              />
            )}
          </ScrollArea.Autosize>
          {error && (
            <Text color="red" fz="xs">
              {error}
            </Text>
          )}
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
