'use strict';
const {createSheetsClient,readMeta}=require('./staging-sheets-publisher.cjs');
// GET-only validation. It never acquires a lease, writes cells or sends email.
async function stagingPreflight({env=process.env,makeClient=createSheetsClient,read=readMeta}={}){
 const result={workbook:'NOT_CONFIGURED',research:'NOT_CONFIGURED',emailCredentialPresent:!!env.VIXALE_V2_STAGING_RESEND_API_KEY,writesPerformed:false};
 if(env.VIXALE_V2_RESEARCH_UNIVERSE&&env.VIXALE_V2_RESEARCH_SECTORS_JSON)try{
  require('./staging-research-runtime.cjs').createResearchRuntime({universeCsv:env.VIXALE_V2_RESEARCH_UNIVERSE,sectorByTicker:JSON.parse(env.VIXALE_V2_RESEARCH_SECTORS_JSON)});
  result.research='CONFIG_VALID_NOT_PROVIDER_VERIFIED';
 }catch{result.research='INVALID_CONFIGURATION'}
 if(!env.VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON)return result;
 try{
  const credentials=JSON.parse(env.VIXALE_V2_STAGING_SERVICE_ACCOUNT_JSON);
  if(credentials.type!=='service_account'||credentials.client_email!=='vixale-engine2-staging@tv-trading-journal.iam.gserviceaccount.com'){
   result.workbook='STAGING_IDENTITY_MISMATCH';return result;
  }
  const metadata=await read(makeClient(credentials));
  result.workbook=metadata.status==='PASS'?'AUTHENTICATED_READ_VERIFIED':'METADATA_NOT_VERIFIED';
 }catch{result.workbook='AUTHENTICATION_OR_ACCESS_FAILED'}
 return result;
}
module.exports={stagingPreflight};
