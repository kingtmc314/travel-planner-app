import {describe,expect,it} from 'vitest';
import {BOOKING_MAX_BYTES,BOOKING_MAX_IMAGE_INPUT_BYTES,BOOKING_IMAGE_MIMES,bookingAnalyzeInput} from '../shared/bookingImport';
describe('Screenshot booking source schema',()=>{
 it('requires explicit allowed image MIME',()=>{expect(bookingAnalyzeInput.safeParse({tripId:1,kind:'image',content:'AA=='}).success).toBe(false);for(const mimeType of BOOKING_IMAGE_MIMES)expect(bookingAnalyzeInput.safeParse({tripId:1,kind:'image',content:'AA==',mimeType}).success).toBe(true);});
 it('rejects active, animated and unsupported MIME declarations',()=>{for(const mimeType of ['image/svg+xml','image/gif','image/heic','application/pdf','text/html','image/jpg'])expect(bookingAnalyzeInput.safeParse({tripId:1,kind:'image',content:'AA==',mimeType}).success).toBe(false);});
 it('preserves PDF/email/EML source contract and rejects misplaced MIME',()=>{for(const kind of ['pdf','email','eml']){expect(bookingAnalyzeInput.safeParse({tripId:1,kind,content:'test'}).success).toBe(true);expect(bookingAnalyzeInput.safeParse({tripId:1,kind,content:'test',mimeType:'image/png'}).success).toBe(false);}});
 it('bounds encoded upload separately from locally compressed originals',()=>{expect(BOOKING_MAX_IMAGE_INPUT_BYTES).toBeGreaterThan(BOOKING_MAX_BYTES);expect(bookingAnalyzeInput.safeParse({tripId:1,kind:'image',content:'A'.repeat(Math.ceil(BOOKING_MAX_BYTES/3)*4+41),mimeType:'image/png'}).success).toBe(false);});
 it('rejects unscoped IDs and unrecognized metadata',()=>{expect(bookingAnalyzeInput.safeParse({tripId:0,kind:'image',content:'AA==',mimeType:'image/png'}).success).toBe(false);expect(bookingAnalyzeInput.safeParse({tripId:1,kind:'image',content:'AA==',mimeType:'image/png',userId:2}).success).toBe(false);});
});
