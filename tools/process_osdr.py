#!/usr/bin/env python3
"""Clean NASA OSDR OSD-569 (CBC) and OSD-575 (CMP) TRANSFORMED files into JSON.
Run from the project root:  python tools/process_osdr.py
Reads  data/raw/ (never edited)  ->  writes data/processed/osdr_labs.json and web/js/osdr.js
(web/js/osdr.js is the same data as a script so the app also works when opened from file://).
"""

import json, re, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "data/raw", ROOT / "data/processed"
PANELS = {
    "cbc": (
        "LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv",
        "OSD-569",
        "Complete blood count (whole blood)",
    ),
    "cmp": (
        "LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv",
        "OSD-575",
        "Comprehensive metabolic panel (serum)",
    ),
}
SAMPLE = re.compile(r"^(C\d{3})_.*?_((?:L|R)[-+]\d+)(?:_cbc)?$")
VALUE = re.compile(r"^(?P<base>.+?)_value(?:_(?P<unit>.+))?$")

ABBR = {"mch", "mchc", "mcv", "mpv", "rdw", "alt", "ast", "bun", "egfr"}


def nice(base):
    return " ".join(w.upper() if w in ABBR else w.capitalize() for w in base.split("_"))


def num(v):
    return None if pd.isna(v) else float(v)


def panel(key):
    fname, study, title = PANELS[key]
    df = pd.read_csv(RAW / fname, encoding="utf-8-sig")
    cols, analytes = list(df.columns), {}
    for c in cols:
        m = VALUE.match(c)
        if not m:
            continue
        base, unit = m["base"], m["unit"] or ""
        # the lab's reference range columns are named *_range_min/_range_max (or *_min/_max for alt/ast)
        lo = next(
            (
                x
                for x in cols
                if x.startswith(base + "_range_min") or x.startswith(base + "_min")
            ),
            None,
        )
        hi = next(
            (
                x
                for x in cols
                if x.startswith(base + "_range_max") or x.startswith(base + "_max")
            ),
            None,
        )
        analytes[base] = {
            "label": nice(base),
            "unit": unit.replace("_", " "),
            "col": c,
            "lo": lo,
            "hi": hi,
        }
    people, timepoints, missing = {}, set(), 0
    for _, row in df.iterrows():
        m = SAMPLE.match(str(row["Sample Name"]))
        if not m:
            print("skip sample name:", row["Sample Name"], file=sys.stderr)
            continue
        who, tp = m.groups()
        timepoints.add(tp)
        for base, a in analytes.items():
            v = num(row[a["col"]])
            missing += v is None
            people.setdefault(who, {}).setdefault(base, {})[tp] = v
            if a["lo"] and a["hi"]:
                a.setdefault("ref", [num(row[a["lo"]]), num(row[a["hi"]])])
    out = {}
    for base, a in analytes.items():
        out[base] = {
            "label": a["label"],
            "unit": a["unit"],
            "ref": a.get("ref"),
            "values": {w: people[w][base] for w in sorted(people)},
        }
    return (
        {"study": study, "title": title, "source_file": fname, "analytes": out},
        timepoints,
        missing,
    )


def quality_flags(data):
    """Never edits raw values. Marks results that cannot be trusted so the app can exclude them from baselines.
    1) CBC row check: absolute count must be about (percent x WBC). A failing row is flagged as a whole (column shift).
       Stored as data["flags"][panel][astronaut][timepoint] (sample level).
    2) Any value more than 5x beyond the lab's own reference range is flagged as implausible.
       Stored on the analyte as analytes[x]["flags"][astronaut][timepoint] (value level).
    """
    flags = {}  # {panel: {astronaut: {timepoint: reason}}}
    cbc = data["panels"]["cbc"]["analytes"]
    for who in data["astronauts"]:
        for tp in data["timepoints"]:
            wbc = cbc["white_blood_cell_count"]["values"][who].get(tp)
            if wbc is None:
                continue
            for cell in (
                "basophils",
                "eosinophils",
                "lymphocytes",
                "monocytes",
                "neutrophils",
            ):
                pct, ab = cbc[cell]["values"][who].get(tp), cbc["absolute_" + cell][
                    "values"
                ][who].get(tp)
                if pct is None or ab is None:
                    continue
                exp = pct / 100 * wbc * 1000
                if exp > 100 and abs(ab - exp) / exp > 0.35:
                    flags.setdefault("cbc", {}).setdefault(who, {})[
                        tp
                    ] = "Row fails absolute-count check (columns look shifted)"
                    break
    for pk, p in data["panels"].items():
        for a in p["analytes"].values():
            a["flags"] = {}  # analyte-level: {astronaut: {timepoint: reason}}
            lo, hi = a["ref"] or [None, None]
            for who, vals in a["values"].items():
                for tp, x in vals.items():
                    if x is None:
                        continue
                    if (hi and x > 5 * hi) or (lo and lo > 0 and x < lo / 5):
                        a["flags"].setdefault(who, {})[
                            tp
                        ] = "Value implausible vs lab range"
    return flags


def order(tp):  # L-92 < L-44 < L-3 < R+1 < R+45 ...
    return (0 if tp[0] == "L" else 1, -int(tp[1:]) if tp[0] == "L" else int(tp[1:]))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data, tps, miss = {"panels": {}}, set(), {}
    for k in PANELS:
        data["panels"][k], t, miss[k] = panel(k)
        tps |= t
    data["timepoints"] = sorted(tps, key=order)
    data["astronauts"] = sorted(
        {
            w
            for p in data["panels"].values()
            for a in p["analytes"].values()
            for w in a["values"]
        }
    )
    data["flags"] = quality_flags(data)
    for pk, f in data["flags"].items():
        for who, t in f.items():
            print("FLAGGED", pk, who, t)
    data["note"] = (
        "NASA OSDR historical lab results. Values are NOT live readings. Missing values stay null; nothing is estimated."
    )
    (OUT / "osdr_labs.json").write_text(json.dumps(data, indent=1))
    (ROOT / "web/js/osdr.js").write_text(
        "window.AB=window.AB||{};AB.OSDR="
        + json.dumps(data, separators=(",", ":"))
        + ";\n"
    )
    for k, p in data["panels"].items():
        print(k, p["study"], len(p["analytes"]), "analytes; missing values:", miss[k])
    print("astronauts:", data["astronauts"], "timepoints:", data["timepoints"])


if __name__ == "__main__":
    main()
