from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any


def resolve_default_db() -> Path:
    env_dir = os.environ.get("STALL_DATA_DIR", "").strip()
    if env_dir:
        return Path(env_dir).resolve() / "stall.db"
    if sys.platform == "win32" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "gaming-stall-ops" / "stall.db"
    return Path.home() / ".local" / "share" / "gaming-stall-ops" / "stall.db"


def resolve_agent_data_dir() -> Path:
    base = resolve_default_db().parent / "agent-scratch"
    base.mkdir(parents=True, exist_ok=True)
    return base


def build_deterministic_brief(snapshot: dict[str, Any]) -> str:
    m = snapshot["metrics"]
    laptops = snapshot["laptops"]
    sessions = snapshot["sessions"]
    payments = snapshot["payments"]

    pending_games = []
    for rig in laptops:
        for g in rig.get("games", []):
            if not g.get("installed", True):
                pending_games.append(f"{rig['code']} ({rig['owner']}): {g['title']}")

    diff = int(m.get("diffAmount", 0))
    diff_slots = int(m.get("diffSlots", 0))
    if diff == 0 and diff_slots == 0:
        recon = f"Matched ({m.get('paidSlotsCount', 0)}/{m.get('totalValidSlotsPlayed', 0)} slots)"
    elif diff < 0 or diff_slots < 0:
        recon = f"SHORT by Rs.{abs(diff)} ({abs(diff_slots)} unpaid slot(s))"
    else:
        recon = f"AHEAD by Rs.{diff} (+{diff_slots} advance slot(s))"

    game_counts: dict[str, int] = {}
    for s in sessions:
        if s.get("status") != "cancelled":
            t = s.get("game_title") or "Unknown"
            game_counts[t] = game_counts.get(t, 0) + int(s.get("blocks_count") or 1)
    top_games = sorted(game_counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    top_games_str = ", ".join(f"{name} ({cnt})" for name, cnt in top_games) if top_games else "None yet"

    unchecked = int(m.get("uncheckedPaymentsCount", 0))
    lines = [
        f"Stall Snapshot ({len(laptops)} laptops · {m.get('activeSessionsCount', 0)} active)",
        f"Collected: Rs.{m.get('collectedTotal', 0)} (Cash Rs.{m.get('cashTotal', 0)} · UPI Rs.{m.get('upiTotal', 0)})",
        f"Played: {m.get('totalValidSlotsPlayed', 0)} slot(s) · Expected Rs.{m.get('expectedRevenue', 0)}",
        f"Cross-Check: {recon}",
        f"Paper Ledger: {unchecked} unchecked payment(s)" if payments else "Paper Ledger: 0 payments logged",
        f"Top Games: {top_games_str}",
    ]
    if pending_games:
        lines.append("Pending Installs: " + "; ".join(pending_games))
    return "\n".join(lines)


def load_local_env() -> None:
    root_env = Path(__file__).resolve().parent.parent / ".env"
    if not root_env.exists():
        return
    for raw in root_env.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        key = k.strip()
        val = v.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def read_snapshot_from_sqlite(db_path: Path) -> dict[str, Any]:
    if not db_path.exists():
        return {
            "exists": False,
            "dbPath": str(db_path),
            "laptops": [],
            "sessions": [],
            "payments": [],
            "metrics": {
                "totalValidSlotsPlayed": 0,
                "expectedRevenue": 0,
                "collectedTotal": 0,
                "cashTotal": 0,
                "upiTotal": 0,
                "diffAmount": 0,
                "diffSlots": 0,
            },
        }

    uri = f"file:{db_path.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        laptops = [dict(r) for r in conn.execute("SELECT * FROM laptops ORDER BY sort_order ASC")]
        for lap in laptops:
            lap["games"] = json.loads(lap.pop("games_json", "[]") or "[]")
            lap["active"] = bool(lap["active"])

        sessions = [
            dict(r)
            for r in conn.execute("SELECT * FROM sessions ORDER BY started_at DESC, slip_no DESC")
        ]
        payments = [
            dict(r)
            for r in conn.execute("SELECT * FROM payments ORDER BY receipt_no DESC, created_at DESC")
        ]

        valid_sessions = [s for s in sessions if s["status"] != "cancelled"]
        valid_payments = [p for p in payments if not p["voided_at"]]

        total_slots = sum(int(s["blocks_count"] or 1) for s in valid_sessions)
        expected_rev = sum(
            int(s["blocks_count"] or 1) * int(s["rate_per_slot"] or 149) for s in valid_sessions
        )
        cash_total = sum(int(p["amount"] or 0) for p in valid_payments if p["method"] != "upi")
        upi_total = sum(int(p["amount"] or 0) for p in valid_payments if p["method"] == "upi")
        collected = cash_total + upi_total
        paid_slots = sum(int(p["slots"] or 1) for p in valid_payments)

        return {
            "exists": True,
            "dbPath": str(db_path),
            "laptops": laptops,
            "sessions": sessions,
            "payments": payments,
            "metrics": {
                "activeSessionsCount": sum(1 for s in valid_sessions if s["status"] == "active"),
                "completedSessionsCount": sum(
                    1 for s in valid_sessions if s["status"] == "completed"
                ),
                "totalValidSlotsPlayed": total_slots,
                "expectedRevenue": expected_rev,
                "cashTotal": cash_total,
                "upiTotal": upi_total,
                "collectedTotal": collected,
                "paidSlotsCount": paid_slots,
                "diffAmount": collected - expected_rev,
                "diffSlots": paid_slots - total_slots,
                "uncheckedPaymentsCount": sum(
                    1 for p in valid_payments if not p["paper_checked"]
                ),
            },
        }
    finally:
        conn.close()


async def run_agent(mode: str, question: str, db_path: Path) -> dict[str, Any]:
    load_local_env()
    snapshot = read_snapshot_from_sqlite(db_path)
    deterministic_brief = build_deterministic_brief(snapshot)

    if not os.environ.get("GEMINI_API_KEY", "").strip():
        return {
            "ok": False,
            "reason": "missing-api-key",
            "message": (
                "GEMINI_API_KEY is not set. Create one at https://aistudio.google.com/app/api-keys "
                "and add GEMINI_API_KEY=... to gaming-stall-ops/.env."
            ),
            "deterministic_brief": deterministic_brief,
            "deterministic_metrics": snapshot["metrics"],
        }

    try:
        import pydantic
        from google.antigravity import Agent, LocalAgentConfig, types
    except ImportError as exc:
        return {
            "ok": False,
            "reason": "sdk-not-installed",
            "message": (
                f"google-antigravity SDK is not installed yet ({exc}). "
                "Run: uv --directory agent sync"
            ),
            "deterministic_brief": deterministic_brief,
            "deterministic_metrics": snapshot["metrics"],
        }

    class ShiftAnalysis(pydantic.BaseModel):
        headline: str
        reconciliation_status: str
        cash_vs_upi_note: str
        top_games_and_rigs: str
        action_items: list[str]

    def get_stall_metrics() -> str:
        """Returns current stall revenue, Cash vs UPI split, slots played, and cross-check diff."""
        return json.dumps(snapshot["metrics"], indent=2)

    def get_laptop_inventory() -> str:
        """Returns all laptops, hardware specs, and installed/pending games."""
        compact = [
            {
                "code": l["code"],
                "owner": l["owner"],
                "specs": l["specs"],
                "games": [
                    f"{g['title']}{' (pending)' if not g.get('installed', True) else ''}"
                    for g in l["games"]
                ],
            }
            for l in snapshot["laptops"]
        ]
        return json.dumps(compact, indent=2)

    def get_payment_and_session_log() -> str:
        """Returns recent sessions and payment receipts including paper check status."""
        return json.dumps(
            {
                "sessions": snapshot["sessions"][:60],
                "payments": snapshot["payments"][:60],
            },
            indent=2,
        )

    instructions = (
        "You are an operations analyst for Mohit's gaming stall (Nov 28, ₹149 per 30-min block, "
        "no pause rule, Cash and UPI tracked with paper slip cross-checks). "
        "Always inspect the live tools before answering. Keep recommendations direct and practical."
    )

    retry_cfg = types.RetryConfig(
        api_retry=types.ModelAPIRetryConfig(
            max_retries=1,
            initial_sleep_duration_ms=500,
        ),
        model_output_retry=types.ModelOutputRetryConfig(max_retries=1),
    )
    caps = types.CapabilitiesConfig(enabled_tools=[types.BuiltinTools.FINISH])
    budget = types.BudgetConfig(max_model_calls=6, max_tool_calls=6)
    app_data_dir = str(resolve_agent_data_dir())

    async def _execute() -> dict[str, Any]:
        if mode == "summary":
            config = LocalAgentConfig(
                tools=[get_stall_metrics, get_laptop_inventory, get_payment_and_session_log],
                system_instructions=instructions,
                response_schema=ShiftAnalysis,
                capabilities=caps,
                retry_config=retry_cfg,
                budget_config=budget,
                app_data_dir=app_data_dir,
            )
            async with Agent(config=config) as agent:
                response = await agent.chat(
                    "Analyze the current stall snapshot: reconcile money collected vs slots played, "
                    "highlight any unchecked paper payments or pending game installs, and summarize top rigs/games."
                )
                data = await response.structured_output()
                if data is None:
                    text = await response.text()
                    return {"ok": True, "summary": text, "metrics": snapshot["metrics"]}
                if hasattr(data, "model_dump"):
                    data = data.model_dump()
                formatted = (
                    f"{data['headline']}\n"
                    f"Reconciliation: {data['reconciliation_status']}\n"
                    f"Cash vs UPI: {data['cash_vs_upi_note']}\n"
                    f"Top Rigs & Games: {data['top_games_and_rigs']}\n"
                    f"Next Actions:\n" + "\n".join(f"- {item}" for item in data["action_items"])
                )
                return {"ok": True, "structured": data, "summary": formatted, "metrics": snapshot["metrics"]}

        config = LocalAgentConfig(
            tools=[get_stall_metrics, get_laptop_inventory, get_payment_and_session_log],
            system_instructions=instructions,
            capabilities=caps,
            retry_config=retry_cfg,
            budget_config=budget,
            app_data_dir=app_data_dir,
        )
        async with Agent(config=config) as agent:
            response = await agent.chat(question or "Summarize current stall status.")
            answer = await response.text()
            return {"ok": True, "answer": answer, "metrics": snapshot["metrics"]}

    try:
        return await asyncio.wait_for(_execute(), timeout=45)
    except Exception as exc:
        return {
            "ok": False,
            "reason": "agent-error",
            "message": f"Antigravity Gemini call failed ({type(exc).__name__}: {exc}). Showing deterministic stall brief instead.",
            "deterministic_brief": deterministic_brief,
            "deterministic_metrics": snapshot["metrics"],
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Google Antigravity SDK analyst for Gaming Stall Ops")
    parser.add_argument("mode", choices=["summary", "ask"], default="summary", nargs="?")
    parser.add_argument("question", nargs="*", help="Question for ask mode")
    parser.add_argument("--db", type=Path, default=resolve_default_db(), help="Path to stall.db")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    args = parser.parse_args()

    result = asyncio.run(run_agent(args.mode, " ".join(args.question).strip(), args.db))
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(result.get("summary") or result.get("answer") or result.get("message"))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
