import { describe, expect, it } from "vitest";
import { sumAmountsByCurrency } from "../shared/moneyTotals";

describe("currency-preserving planned costs", () => {
  it("retains separate currency subtotals", () => {
    expect(sumAmountsByCurrency([{cost:"100",currency:"HKD"},{cost:"400",currency:"TWD"},{cost:"50",currency:"hkd"}])).toEqual({HKD:150,TWD:400});
  });
  it("ignores nonfinite and invalid amounts, never prefix-parses a currency string", () => {
    expect(sumAmountsByCurrency([{cost:"125 USD",currency:"USD"},{cost:"Infinity",currency:"USD"},{cost:-1,currency:"USD"},{cost:10,currency:null}],"JPY")).toEqual({JPY:10});
  });
  it("adds using integer cents", () => {
    expect(sumAmountsByCurrency([{cost:0.1,currency:"HKD"},{cost:0.2,currency:"HKD"}])).toEqual({HKD:0.3});
  });
});
