import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./_core/env",()=>({ENV:{forgeApiUrl:"https://fixture.invalid",forgeApiKey:"test-only"}}));
import { invokeLLM } from "./_core/llm";
afterEach(()=>vi.unstubAllGlobals());
function capture(){ const mocked=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200}));vi.stubGlobal('fetch',mocked);return mocked; }
describe('LLM model request compatibility',()=>{
 it('keeps legacy default model and thinking without changing existing AI requests',async()=>{
  const fetch=capture();await invokeLLM({messages:[{role:'user',content:'fixture'}]});
  const body=JSON.parse((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
  expect(body.model).toBe('gemini-2.5-flash');expect(body.max_tokens).toBe(32768);expect(body.thinking).toEqual({budget_tokens:128});
 });
 it('uses explicit verified model, reasoning and Gemini token shape for PDF input',async()=>{
  const fetch=capture();await invokeLLM({model:'gemini-3.8-flash',reasoning:{effort:'low'},max_tokens:8192,messages:[{role:'user',content:[{type:'text',text:'extract fixture'},{type:'file_url',file_url:{url:'data:application/pdf;base64,JVBERi0=',mime_type:'application/pdf'}}]}]});
  const call=fetch.mock.calls[0] as unknown as [string,RequestInit];const body=JSON.parse(call[1].body as string);
  expect(body.model).toBe('gemini-3.8-flash');expect(body.reasoning).toEqual({effort:'low'});expect(body.thinking).toBeUndefined();expect(body.max_tokens).toBe(8192);expect(body.max_completion_tokens).toBeUndefined();expect(body.messages[0].content[1].file_url.mime_type).toBe('application/pdf');expect(call[1].signal).toBeInstanceOf(AbortSignal);
 });
 it('supports the explicit OpenAI completion-token key without conflicting token caps',async()=>{
  const fetch=capture();await invokeLLM({model:'gpt-5.5',max_completion_tokens:1000,messages:[{role:'user',content:'fixture'}]});
  const body=JSON.parse((fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
  expect(body.max_completion_tokens).toBe(1000);expect(body.max_tokens).toBeUndefined();expect(body.thinking).toBeUndefined();
 });
});
