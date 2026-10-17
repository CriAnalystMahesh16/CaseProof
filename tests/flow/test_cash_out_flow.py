import caseproof.cloud.bank_network as network
from tests.flow import test_google_backend_contract as contract


def test_full_cloud_flow_still_reconciles_when_every_cash_out_is_due(tmp_path, monkeypatch):
    monkeypatch.setattr(network, "CASH_OUT_PLAN", ((0, 0, 2), (1, 0, 2), (0, 0, 1), (1, 0, 1)))
    seen = []
    original = network.cash_outs
    monkeypatch.setattr(network, "cash_outs", lambda *a: seen.extend(original(*a)) or original(*a))
    contract.test_new_cloud_complaint_request_reply_approval_and_two_deliveries(
        tmp_path, monkeypatch
    )
    assert seen, "at least one cash-out was revealed by the refresh"
