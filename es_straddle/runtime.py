"""Local paper-runtime status, logging and an explicit training opt-in."""
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, time as wall_time, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from .core import ET


def training_enabled(args):
    return bool(getattr(args, 'paper_training', False) and args.paper_execute)


def history_policy_allowed(args):
    return args.history_all_clients_verified or training_enabled(args)


def validate_execution_mode(args):
    if getattr(args, 'paper_training', False) and not args.paper_execute:
        raise ValueError('paper-training requires explicit paper-execute')
    if args.paper_execute and not history_policy_allowed(args):
        raise ValueError('Paper execution requires verified history or explicit paper-training acceptance')


def next_entry(clock, state_dir):
    """Next scheduled opportunity; exchange/session checks still decide entry."""
    local = clock.astimezone(ET)
    for offset in range(8):
        day = local.date() + timedelta(days=offset)
        candidate = datetime.combine(day, wall_time(20, 20), ET)
        if (day.weekday() not in (4, 5) and local < candidate + timedelta(minutes=1)
                and not (state_dir / ('session-' + day.isoformat() + '.json')).exists()):
            return candidate.isoformat()
    return None


def paused(args):
    return (Path(args.state_dir) / 'pause-new-entries.flag').exists()


class StatusPublisher:
    def __init__(self, args):
        self.args, self.last_at, self.last_key = args, 0, None

    def publish(self, phase, broker=None, engine=None, reason=None, force=False):
        key = (phase, reason, engine.plan.session if engine else None)
        tick = time.monotonic()
        if not force and key == self.last_key and tick - self.last_at < 15:
            return
        args = self.args
        clock = datetime.now(timezone.utc)
        value = {'updated_at_utc': clock.isoformat(), 'updated_at_et': clock.astimezone(ET).isoformat(),
                 'pid': os.getpid(), 'phase': phase,
                 'mode': 'PAPER_TRAINING' if training_enabled(args) else 'PAPER_EXECUTION',
                 'paper_only': True, 'live_trading_allowed': False,
                 'history_visibility_verified': args.history_all_clients_verified,
                 'acceptance_pending': training_enabled(args),
                 'connected': bool(broker and broker.ib.isConnected() and broker.continuous),
                 'pause_new_entries': paused(args),
                 'session': engine.plan.session if engine else None,
                 'next_scheduled_entry_et': None if engine or paused(args) else next_entry(clock, Path(args.state_dir)),
                 'reason': str(reason).replace(args.account, '<paper-account>')[:500] if reason else None}
        path = Path(args.state_dir) / 'status.json'
        temp = path.with_suffix('.tmp')
        with temp.open('w', encoding='utf-8') as stream:
            json.dump(value, stream, indent=2); stream.flush(); os.fsync(stream.fileno())
        os.replace(temp, path)
        if key != self.last_key:
            logging.getLogger('es_straddle.runtime').info(json.dumps({
                'event': 'phase_change', 'at_utc': value['updated_at_utc'],
                'pid': value['pid'], 'phase': phase, 'mode': value['mode'],
                'connected': value['connected'], 'session': value['session'],
                'reason': value['reason']}))
        self.last_at, self.last_key = tick, key


def configure_logging(args):
    """Bounded local output also works when launched with pythonw.exe."""
    log_dir = Path(args.state_dir) / 'logs'
    log_dir.mkdir(exist_ok=True)
    logger = logging.getLogger('es_straddle.runtime')
    logger.setLevel(logging.INFO); logger.propagate = False
    handler = RotatingFileHandler(log_dir / 'runtime.log', maxBytes=2_000_000,
                                  backupCount=5, encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
    logger.addHandler(handler)

    class LogStream:
        def __init__(self): self.buffer = ''
        def write(self, value):
            self.buffer += value
            while '\n' in self.buffer:
                line, self.buffer = self.buffer.split('\n', 1)
                if line: logger.info(line.replace(args.account, '<paper-account>'))
            return len(value)
        def flush(self):
            if self.buffer:
                logger.info(self.buffer.replace(args.account, '<paper-account>')); self.buffer = ''
            handler.flush()
        def isatty(self): return False

    sys.stdout, sys.stderr = LogStream(), LogStream()
