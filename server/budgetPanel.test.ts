import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripBudgetEntry } from '../shared/budget';
const state=vi.hoisted(()=>({zh:true,entry:null as TripBudgetEntry|null,loading:false,error:false}));
vi.mock('@/hooks/useI18n',()=>({useI18n:()=>({isZh:state.zh,lang:state.zh?'zh':'en'})}));
vi.mock('@/lib/trpc',()=>({trpc:{useUtils:()=>({invalidate:vi.fn()}),budgets:{get:{useQuery:()=>({data:state.entry,isLoading:state.loading,isError:state.error,isFetching:false,refetch:vi.fn()})},set:{useMutation:()=>({isPending:false,error:null,mutate:vi.fn(),reset:vi.fn()})},clear:{useMutation:()=>({isPending:false,error:null,mutate:vi.fn(),reset:vi.fn()})}}}}));
import { TripBudgetPanel } from '../client/src/components/TripBudgetPanel';
function html(){return renderToStaticMarkup(React.createElement(TripBudgetPanel,{tripId:1}));}
beforeEach(()=>{state.zh=true;state.loading=false;state.error=false;state.entry={tripId:1,tripName:'QA trip',baseCurrency:'HKD',canEdit:true,budget:{amount:'1000.00',currency:'HKD',warningPercent:80},summary:{spent:500,knownSpent:500,remaining:500,utilization:50,status:'safe',complete:true,unconvertedCount:0,expenseCount:2,originalTotals:{HKD:500}}};});
describe('Shared budget panel presentation',()=>{
 it('labels safe budget and uses emerald not warning color',()=>{const text=html();expect(text).toContain('預算內');expect(text).toContain('bg-emerald-500');expect(text).toContain('50%');expect(text).toContain('HKD 500.00');});
 it('labels threshold crossing amber',()=>{Object.assign(state.entry!.summary,{spent:800,knownSpent:800,remaining:200,utilization:80,status:'near'});const text=html();expect(text).toContain('接近預算');expect(text).toContain('bg-amber-500');expect(text).toContain('80%');});
 it('displays full overspend ratio but clamps progress bounds',()=>{Object.assign(state.entry!.summary,{spent:1400,knownSpent:1400,remaining:-400,utilization:140,status:'over'});const text=html();expect(text).toContain('超出金額');expect(text).toContain('HKD 400.00');expect(text).toContain('140%');expect(text).toContain('bg-red-500');expect(text).toContain('aria-valuenow="100"');});
 it('unknown conversions never produce safe status or available balance',()=>{Object.assign(state.entry!.summary,{spent:null,knownSpent:500,remaining:null,utilization:null,status:'incomplete',complete:false,unconvertedCount:1});const text=html();expect(text).toContain('已知淨支出（部分）');expect(text).toContain('未能確定');expect(text).not.toContain('bg-emerald-500');expect(text).toContain('缺少的記錄可能包括退款');});
 it('does not expose mutation buttons to a viewer',()=>{state.entry!.canEdit=false;const text=html();expect(text).toContain('唯讀');expect(text).not.toContain('>編輯<');expect(text).not.toContain('>設定預算<');});
 it('has explicit loading and errors without invented zero spend',()=>{state.loading=true;state.entry=null;let text=html();expect(text).toContain('aria-busy="true"');expect(text).not.toContain('HKD 0.00');state.loading=false;state.error=true;text=html();expect(text).toContain('未能載入預算');expect(text).not.toContain('HKD 0.00');});
 it('can render English statuses and disclosures',()=>{state.zh=false;const text=html();expect(text).toContain('Shared trip budget');expect(text).toContain('Within budget');expect(text).toContain('refunds net subtract');});
});
