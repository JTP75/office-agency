// The street split by machine: districts from the snapshot, and their layout.

import assert from "node:assert/strict";
import test from "node:test";
import { districtsOf } from "../src/state/districts.ts";
import { BUILDING_W, buildStreet } from "../src/game/layout/street.ts";

const machines = [
  { id: "a", label: "pacel-pc", status: "online", message: null },
  { id: "b", label: "pacel-orin", status: "offline", message: "ssh: timed out" },
];

test("local comes first, then each machine, even one with no buildings", () => {
  const ds = districtsOf(["office-agency", "vettd", "tts"], { "office-agency": null, vettd: "pacel-pc", tts: null }, machines);
  assert.deepEqual(
    ds.map((d) => [d.label, d.status, d.projects]),
    [
      ["local", null, ["office-agency", "tts"]],
      ["pacel-pc", "online", ["vettd"]],
      ["pacel-orin", "offline", []],
    ],
  );
});

test("a machine that left the catalog keeps its buildings, shown offline", () => {
  const ds = districtsOf(["vettd"], { vettd: "gone-box" }, []);
  assert.deepEqual(ds.at(-1), { machine: "gone-box", label: "gone-box", status: "offline", message: null, projects: ["vettd"] });
});

test("without machines the street is laid out as before: no signs, no hedges", () => {
  const plan = buildStreet(districtsOf(["a", "b"], { a: null, b: null }, []));
  assert.deepEqual(plan.districts, []);
  assert.deepEqual(
    plan.lots.map((l) => l.x),
    [3, 12],
  );
});

test("districts are fenced by hedges that leave the road open", () => {
  const plan = buildStreet(districtsOf(["a", "b", "c"], { a: null, b: "pacel-pc", c: "pacel-pc" }, machines));
  assert.equal(plan.districts.length, 3);
  const [local, pc, orin] = plan.districts;
  const hedge = local.x1;
  assert.equal(pc.x0, hedge + 1);
  const at = (x, y) => plan.bushes.some((b) => b.x === x && b.y === y);
  assert.ok(at(hedge, 5) && at(hedge, 15));
  for (const y of [10, 11, 12]) assert.ok(!at(hedge, y), `road row ${y} stays open`);
  // Every building is inside its own district, clear of the hedges.
  for (const lot of plan.lots) {
    const d = plan.districts.find((x) => x.projects.includes(lot.project));
    assert.ok(lot.x >= d.x0 && lot.x + BUILDING_W <= d.x1, lot.project);
  }
  // The empty, offline district still has room for its sign.
  assert.ok(orin.x1 - orin.x0 >= 7 && orin.cx > orin.x0 && orin.cx < orin.x1);
  assert.ok(!plan.bushes.some((b) => b.x === plan.spawn.x && b.y === plan.spawn.y));
});
