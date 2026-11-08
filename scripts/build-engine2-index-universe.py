"""Rebuild the pinned index universe from downloaded source files, then review the PR.
Development dependencies: pandas, lxml, openpyxl. Never called by the financial writer.
Source filenames and official download URLs are documented in ENGINE2_INDEX_UNIVERSE.md.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import pandas as pd

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', required=True)
parser.add_argument('--verified-at', required=True)
parser.add_argument('--output', default='engine-v2/data/sp500-nasdaq100.json')
args = parser.parse_args()
root = Path(args.source_dir)
verified = datetime.date.fromisoformat(args.verified_at)
sp = pd.read_html(root / 'sp500.html')[0]
nd = pd.read_html(root / 'ndx-components.html')[0]
directory = pd.read_csv(root / 'nasdaqtraded.txt', sep='|')
directory = directory[directory['Test Issue'] == 'N']
spy = pd.read_excel(root / 'spy-holdings.xlsx', header=4)
qqq = json.loads((root / 'qqq-all.json').read_text())
spy_date = str(pd.read_excel(root / 'spy-holdings.xlsx').iloc[1, 1])
spy_date = datetime.datetime.strptime(spy_date.removeprefix('As of '), '%d-%b-%Y').date()
qqq_date = datetime.date.fromisoformat(qqq['effectiveDate'])
dir_date = datetime.datetime.strptime((root / 'nasdaqtraded.txt').read_text().split('File Creation Time: ')[1][:8], '%m%d%Y').date()
assert all(datetime.timedelta(0) <= verified - d <= datetime.timedelta(days=7) for d in [spy_date, qqq_date, dir_date]), 'Source dates must be current and not future'
assert 490 <= len(sp) <= 510 and 95 <= len(nd) <= 110
assert sp.Symbol.is_unique and nd.Ticker.is_unique
assert set(sp.Symbol) <= set(spy.Ticker.dropna().str.replace('-', '.', regex=False)), 'SP500/SPY mismatch'
assert set(nd.Ticker) == {r['ticker'] for r in qqq['holdings'] if r['securityTypeCode'] in ('COM', 'ADR', 'DRNY')}, 'Nasdaq100/QQQ mismatch'
sectors = {'Communication Services':'XLC','Consumer Discretionary':'XLY','Consumer Staples':'XLP','Energy':'XLE','Financials':'XLF','Health Care':'XLV','Industrials':'XLI','Information Technology':'XLK','Materials':'XLB','Real Estate':'XLRE','Utilities':'XLU','Technology':'XLK','Telecommunications':'XLC','Basic Materials':'XLB'}
rows = {}
for frame, index, tc, nc, sc, ic in [(sp,'SP500','Symbol','Security','GICS Sector','GICS Sub-Industry'), (nd,'NASDAQ100','Ticker','Company','ICB Industry[2]','ICB Subsector[2]')]:
    for _, r in frame.iterrows():
        ticker = r[tc]
        if ticker in rows:
            rows[ticker]['indices'].append(index)
            continue
        match = directory[(directory.Symbol == ticker) | (directory['CQS Symbol'] == ticker)]
        assert len(match) == 1 and match.iloc[0].ETF == 'N', ticker
        exchange = {'N':'NYSE','Q':'NASDAQ','Z':'BATS'}[match.iloc[0]['Listing Exchange']]
        sector = 'SMH' if 'Semiconductor' in r[ic] or ticker == 'ASML' else sectors[r[sc]]
        rows[ticker] = {'ticker':ticker,'name':r[nc],'exchange':exchange,'sectorBenchmark':sector,'sector':r[sc],'industry':r[ic],'taxonomy':'GICS' if index == 'SP500' else 'ICB','indices':[index]}
sources = [
 ('sp500','https://en.wikipedia.org/wiki/List_of_S%26P_500_companies','sp500.html'),
 ('nasdaq100','https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies','ndx-components.html'),
 ('sp500HoldingsVerification','https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx','spy-holdings.xlsx'),
 ('nasdaq100HoldingsVerification','https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&interval=monthly&productType=ETF','qqq-all.json'),
 ('listingExchange','https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt','nasdaqtraded.txt')]
result = {'schemaVersion':1,'policy':'SP500_NASDAQ100_V1','verifiedAt':args.verified_at,'holdingsAsOf':min(spy_date, qqq_date).isoformat(),'directoryAsOf':dir_date.isoformat(),'counts':{'SP500':len(sp),'NASDAQ100':len(nd),'overlap':len(set(sp.Symbol) & set(nd.Ticker)),'union':len(rows)},'sources':[{'id':i,'url':u,'sha256':hashlib.sha256((root / f).read_bytes()).hexdigest()} for i,u,f in sources],'members':[rows[t] for t in sorted(rows)]}
Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result['counts']))
