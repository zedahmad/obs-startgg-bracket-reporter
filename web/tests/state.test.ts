import assert from "node:assert/strict";
import test from "node:test";
import { reconcileOfflineInput } from "../src/offlineDetails.ts";
import { getSettingsChanges, mergeSettingsChanges } from "../src/settingsChanges.ts";

test("score-only updates preserve unsaved offline details", () => {
  assert.equal(reconcileOfflineInput("New name", "Saved name", "Saved name"), "New name");
  assert.equal(reconcileOfflineInput("New round", "Round 1", "Round 1"), "New round");
});

test("offline details hydrate and follow remote edits when pristine", () => {
  assert.equal(reconcileOfflineInput("", undefined, "Saved name"), "Saved name");
  assert.equal(reconcileOfflineInput("Saved name", "Saved name", "Remote name"), "Remote name");
  assert.equal(reconcileOfflineInput("Local edit", "Saved name", "Remote name"), "Local edit");
});

test("settings saves include only edited leaves", () => {
  const before = { text: { nameSize: 28, scoreSize: 38 }, canvas: { width: 1920 } };
  const local = { ...before, text: { ...before.text, nameSize: 32 } };
  assert.deepEqual(getSettingsChanges(before, local), { text: { nameSize: 32 } });
  assert.deepEqual(getSettingsChanges(before, structuredClone(before)), {});
});

test("remote settings reconcile with pending and in-flight edits", () => {
  const remote = { text: { nameSize: 28, scoreSize: 48 }, canvas: { width: 1280 } };
  const inFlight = { text: { nameSize: 32 } };
  const pending = { text: { nameSize: 36 } };
  const next = mergeSettingsChanges(mergeSettingsChanges(remote, inFlight), pending);
  assert.deepEqual(next, {
    text: { nameSize: 36, scoreSize: 48 },
    canvas: { width: 1280 },
  });
});

test("an open settings draft accepts remote changes but preserves invalid CSS input", () => {
  const previous = { text: { size: 28 }, background: { customCss: "" } };
  const draft = { ...previous, background: { customCss: "linear-gradient(" } };
  const remote = { ...previous, text: { size: 32 } };
  assert.deepEqual(
    mergeSettingsChanges(remote, getSettingsChanges(previous, draft)),
    { text: { size: 32 }, background: { customCss: "linear-gradient(" } },
  );
});
