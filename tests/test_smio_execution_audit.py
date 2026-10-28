import copy
import json
import unittest
from bridge.smio_execution_audit import audit


class AuditTests(unittest.TestCase):
    def test_redaction_unknown_times_and_no_mutation(self):
        journal = {'setups':{'setup':{'account':'PRIVATE_ACCOUNT', 'state':'TARGET_CANCEL_PENDING',
            'payload':{'symbol':'APA','strategy_id':'SMIO_RSI_RESEARCH'},
            'target':{'id':1,'ref':'owned'}, 'recovery_blocker':'PRIVATE_ACCOUNT conflict'}}}
        original = copy.deepcopy(journal)
        result = audit(journal, {'ok':True,'positions':[{'symbol':'APA','sec_type':'STK','position':7}]},
            {'ok':True,'orders':[]}, {'ok':True,'accounts':['PRIVATE_ACCOUNT']}, {}, 'PRIVATE_ACCOUNT')
        row = result['findings'][0]
        self.assertTrue(row['account_match'])
        self.assertEqual(row['broker_position_quantity'], 7)
        self.assertEqual(row['target_status'], 'not_visible_or_ambiguous')
        self.assertIsNone(row['bridge_handler_received_at'])
        self.assertNotIn('PRIVATE_ACCOUNT', json.dumps(result))
        self.assertEqual(journal, original)

    def test_unavailable_broker_is_not_flat(self):
        result = audit({'setups':{'x':{'payload':{'symbol':'APA'}}}}, {}, {}, {}, {})
        self.assertIsNone(result['findings'][0]['broker_position_quantity'])
        self.assertIsNone(result['findings'][0]['account_match'])

    def test_http_receipt_is_joined_by_exact_event_not_symbol(self):
        journal = {'setups':{'x':{'payload':{'symbol':'APA','event_id':'exact'}}}}
        inbox = {'receipts':{'exact':{'received_at':123,'state':'QUARANTINED'},
                              'other':{'received_at':999,'state':'HANDLED'}}}
        result = audit(journal, {}, {}, {}, {}, inbox=inbox)
        row = result['findings'][0]
        self.assertEqual(row['bridge_http_received_at'], 123)
        self.assertEqual(row['durable_receipt_state'], 'QUARANTINED')
        self.assertIsNone(row['bridge_handler_received_at'])
