"""Gemini-drafted text that is shown only after deterministic verification.

Gemini writes; code checks every sentence or finding against the sources it cites
and drops anything it cannot trace. Rules still decide readiness and requests, and a
human still approves. Each feature degrades to {"available": False} on any failure.
"""

import re
import unicodedata

NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers(text):
    out = set()
    for raw in NUMBER.findall(str(text)):
        value = raw.replace(",", "")
        out.add(value)
        if value.endswith(".00"):
            out.add(value[:-3])
    return out


def _norm(text):
    text = unicodedata.normalize("NFKC", str(text)).lower()
    return re.sub(r"[^\w@.]+", "", text)


def _rupees(minor):
    return "₹{:,}".format(round((minor or 0) / 100)) if minor is not None else "unknown amount"


def _time(value):
    from datetime import datetime, timedelta, timezone

    try:
        at = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return str(value)
    return at.astimezone(timezone(timedelta(hours=5, minutes=30))).strftime("%d %b %Y %H:%M IST")


def case_sources(snap, brief):
    """Numbered, human-readable facts Gemini may cite; nothing else is citable."""
    rows = []
    for s in brief["victim_statements"]:
        value = _rupees(s["value"]) if s["kind"] == "amount" else s["value"]
        quote = "; ".join(x["text"] for x in s["sources"])[:240]
        rows.append(
            {
                "id": "C-" + s["claim_id"][-6:],
                "text": f'{s["kind"]} = {value} ({s["state"]}; source text: "{quote}")',
            }
        )
    for p in brief["payments"]:
        rows.append(
            {
                "id": "P-" + p["txn_id"][-4:],
                "text": f"Bank ledger: {p['status']} debit of {_rupees(p['amount_minor'])} "
                f"to {p.get('payee') or 'unknown payee'} at {_time(p.get('at'))}, "
                f"reference {p.get('reference') or 'none'}",
            }
        )
    clock = snap.readiness.clock or {}
    if clock.get("first_debit_at"):
        # Stable values only: minutes-remaining changes every revision (the UI shows
        # a live countdown), and would otherwise force a fresh model call each time.
        rows.append(
            {
                "id": "K",
                "text": f"First disputed debit at {_time(clock['first_debit_at'])}; "
                "the one-hour golden-hour window for freezing funds runs from then; "
                f"amount still recoverable {_rupees(clock.get('recoverable_now'))}",
            }
        )
    for i, r in enumerate(brief["downstream_observations"][:8]):
        rows.append(
            {
                "id": f"T{i + 1}",
                "text": f"{r.get('reporting_bank', 'Receiving bank')} reported account "
                f"{r.get('account')} balance {_rupees(r.get('balance_minor'))} "
                f"at {_time(r.get('reported_at'))}",
            }
        )
    for fact in brief["unknowns"]:
        rows.append({"id": "G-" + fact, "text": f"Not yet established: {fact}"})
    rows.append({"id": "R", "text": f"Rule-based assessment: {snap.readiness.disposition}"})
    return rows


def verify_sentences(sentences, sources):
    """Keep a sentence only if it cites known sources and every number in it
    appears in those sources. Returns (kept, dropped_count)."""
    by_id = {s["id"]: s["text"] for s in sources}
    kept = []
    for s in sentences or []:
        cited = [c for c in s.get("source_ids", []) if c in by_id]
        text = str(s.get("text", "")).strip()
        if not text or not cited or len(cited) != len(s.get("source_ids", [])):
            continue
        allowed = set().union(*(_numbers(by_id[c]) for c in cited))
        if not _numbers(text) <= allowed:
            continue
        kept.append({"text": text, "source_ids": cited})
    return kept, len(sentences or []) - len(kept)


_SENTENCE = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "source_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["text", "source_ids"],
}
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "array", "items": _SENTENCE},
        "cybercrime_statement": {"type": "array", "items": _SENTENCE},
    },
    "required": ["summary", "cybercrime_statement"],
}


def _unavailable(error):
    return {"available": False, "reason": type(error).__name__}


def case_summary(o, snap, brief):
    sources = case_sources(snap, brief)
    try:
        result = o.llm.generate(
            snap.case_id + ":genai",
            "narrate",
            {"case_id": snap.case_id, "revision": snap.revision, "sources": sources},
            SUMMARY_SCHEMA,
        )
    except Exception as error:  # noqa: BLE001 - optional feature degrades
        return _unavailable(error)
    data = result["data"]
    summary, d1 = verify_sentences(data.get("summary"), sources)
    statement, d2 = verify_sentences(data.get("cybercrime_statement"), sources)
    return {
        "available": True,
        "model": o.llm.model_id,
        "revision": snap.revision,
        "summary": summary,
        "cybercrime_statement": statement,
        "dropped_unverified": d1 + d2,
        "sources": sources,
    }


READ_SCHEMA = {
    "type": "object",
    "properties": {
        "document_type": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "string"},
                    "segment_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["label", "value", "segment_ids"],
            },
        },
        "scam_signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "signal": {"type": "string"},
                    "segment_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["signal", "segment_ids"],
            },
        },
    },
    "required": ["document_type", "findings", "scam_signals"],
}


def verify_reading(data, segments):
    """A finding survives only if its value is literally present in the OCR lines
    it points to; a scam signal only if it points to real lines of this image."""
    text = {s.segment_id: s.text for s in segments}
    findings, signals = [], []
    for f in data.get("findings") or []:
        ids = [i for i in f.get("segment_ids", []) if i in text]
        value = _norm(f.get("value", ""))
        if ids and value and value in _norm(" ".join(text[i] for i in ids)):
            findings.append({"label": f["label"], "value": f["value"], "segment_ids": ids})
    for s in data.get("scam_signals") or []:
        ids = [i for i in s.get("segment_ids", []) if i in text]
        if ids and s.get("signal"):
            signals.append({"signal": s["signal"], "segment_ids": ids})
    dropped = len(data.get("findings") or []) + len(data.get("scam_signals") or [])
    return findings, signals, dropped - len(findings) - len(signals)


def read_evidence(o, snap, artifact, image):
    segments = [s for s in snap.segments if s.artifact_id == artifact.artifact_id]
    if not segments:
        return {"available": False, "reason": "no_ocr_lines"}
    try:
        result = o.llm.generate(
            snap.case_id + ":genai",
            "read-evidence",
            {
                "artifact_id": artifact.artifact_id,
                "kind": artifact.kind,
                "lines": [{"segment_id": s.segment_id, "text": s.text} for s in segments],
            },
            READ_SCHEMA,
            image=image,
            mime=artifact.mime_type,
        )
    except Exception as error:  # noqa: BLE001
        return _unavailable(error)
    findings, signals, dropped = verify_reading(result["data"], segments)
    return {
        "available": True,
        "model": o.llm.model_id,
        "document_type": result["data"].get("document_type", ""),
        "findings": findings,
        "scam_signals": signals,
        "dropped_unverified": dropped,
    }


# Facts a bank needs in the first report; rules own this list, Gemini only words it.
INTAKE_FACTS = {
    "contact_channel": "How the scammer first contacted you (call, SMS, WhatsApp, website)",
    "first_contact_time": "When the first contact happened",
    "claimed_identity": "Who they claimed to be",
    "instruction": "What they told you to do",
    "amount": "How much money you sent",
    "payee": "Where the money went (UPI ID, account or app)",
    "credentials_shared": "Whether you shared an OTP, PIN or password",
}
INTAKE_SCHEMA = {
    "type": "object",
    "properties": {
        "language": {"type": "string"},
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "fact": {"type": "string", "enum": list(INTAKE_FACTS)},
                    "quote": {"type": "string"},
                    "question": {"type": "string"},
                },
                "required": ["fact", "quote", "question"],
            },
        },
    },
    "required": ["language", "facts"],
}


def verify_intake(data, narrative):
    plain = re.sub(r"\s+", " ", narrative).strip().lower()
    by_fact = {f.get("fact"): f for f in data.get("facts") or [] if f.get("fact") in INTAKE_FACTS}
    present, questions = [], []
    for fact, meaning in INTAKE_FACTS.items():
        row = by_fact.get(fact, {})
        quote = re.sub(r"\s+", " ", str(row.get("quote", ""))).strip()
        if len(quote) >= 2 and quote.lower() in plain:
            present.append({"fact": fact, "label": meaning, "quote": quote})
        else:
            questions.append(
                {"fact": fact, "question": str(row.get("question") or "").strip() or meaning}
            )
    return present, questions


def intake_assist(o, key, narrative):
    try:
        result = o.llm.generate(
            "intake:" + key,
            "intake",
            {"narrative": narrative, "facts": INTAKE_FACTS},
            INTAKE_SCHEMA,
        )
    except Exception as error:  # noqa: BLE001
        return _unavailable(error)
    present, questions = verify_intake(result["data"], narrative)
    return {
        "available": True,
        "model": o.llm.model_id,
        "language": result["data"].get("language", ""),
        "present": present,
        "questions": questions[:4],
    }
