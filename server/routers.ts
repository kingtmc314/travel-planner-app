import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// ─── Trips Router ─────────────────────────────────────────────────────────────
const tripsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserTrips(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const trip = await db.getTripById(input.tripId);
      if (!trip) throw new Error("Trip not found");
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      return { ...trip, memberRole: role };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      destination: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      baseCurrency: z.string().default("HKD"),
      coverImage: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const trip = await db.createTrip({ ...input, createdBy: ctx.user.id });
      // Add creator as owner
      await db.addTripMember({
        tripId: trip.id,
        userId: ctx.user.id,
        name: ctx.user.name ?? "Owner",
        email: ctx.user.email ?? undefined,
        role: "owner",
      });
      // Auto-generate itinerary days
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      let dayNum = 1;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        await db.createItineraryDay({
          tripId: trip.id,
          dayDate: d.toISOString().split("T")[0],
          dayNumber: dayNum++,
          title: `Day ${dayNum - 1}`,
        });
      }
      return { tripId: trip.id };
    }),

  update: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      name: z.string().optional(),
      destination: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      baseCurrency: z.string().optional(),
      coverImage: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tripId, ...data } = input;
      const role = await db.getUserTripRole(tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      await db.updateTrip(tripId, data);
      await db.notifyTripMembers(tripId, ctx.user.id, "trip_updated", "行程已更新", `${ctx.user.name ?? "成員"} 更新了行程資訊`);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (role !== "owner") throw new Error("Only owner can delete trip");
      await db.deleteTrip(input.tripId);
      return { success: true };
    }),

  importDemo: protectedProcedure.mutation(async ({ ctx }) => {
    const already = await db.hasDemoTrip(ctx.user.id);
    if (already) return { alreadyExists: true };

    const trip = await db.createTrip({
      name: "埃及探索之旅 🇪🇬",
      destination: "開羅 • 盧克索 • 亞斯文",
      description: "探索古埃及文明，遊覽金字塔、神廟與尼羅河",
      startDate: "2026-03-10",
      endDate: "2026-03-17",
      baseCurrency: "EGP",
      coverImage: "https://images.unsplash.com/photo-1568322445389-f64ac2515020?w=800&q=70",
      isDemoTrip: true,
      createdBy: ctx.user.id,
    });

    await db.addTripMember({
      tripId: trip.id,
      userId: ctx.user.id,
      name: ctx.user.name ?? "旅行者",
      email: ctx.user.email ?? undefined,
      role: "owner",
    });

    // Demo members
    const demoMembers = [
      { name: "Alice Chen", email: "alice@example.com", role: "editor" as const },
      { name: "Bob Wong", email: "bob@example.com", role: "viewer" as const },
    ];
    for (const m of demoMembers) {
      await db.addTripMember({ tripId: trip.id, ...m });
    }

    // Demo itinerary days
    const days = [
      { date: "2026-03-10", num: 1, title: "抵達開羅" },
      { date: "2026-03-11", num: 2, title: "吉薩金字塔" },
      { date: "2026-03-12", num: 3, title: "開羅博物館" },
      { date: "2026-03-13", num: 4, title: "飛往盧克索" },
      { date: "2026-03-14", num: 5, title: "帝王谷" },
      { date: "2026-03-15", num: 6, title: "卡納克神廟" },
      { date: "2026-03-16", num: 7, title: "亞斯文" },
      { date: "2026-03-17", num: 8, title: "返程" },
    ];

    const dayIds: Record<number, number> = {};
    for (const d of days) {
      const day = await db.createItineraryDay({ tripId: trip.id, dayDate: d.date, dayNumber: d.num, title: d.title });
      dayIds[d.num] = day.id;
    }

    // Demo activities
    const demoActivities = [
      { dayNum: 1, title: "抵達開羅國際機場", location: "開羅國際機場", startTime: "14:00", category: "transport" as const, notes: "航班 MS 965" },
      { dayNum: 1, title: "入住酒店", location: "Marriott Mena House", startTime: "17:00", category: "accommodation" as const },
      { dayNum: 2, title: "吉薩金字塔群", location: "吉薩高原", startTime: "08:00", endTime: "12:00", category: "attraction" as const, notes: "記得帶防曬霜！", lat: "29.9792", lng: "31.1342" },
      { dayNum: 2, title: "獅身人面像", location: "吉薩", startTime: "12:30", endTime: "13:30", category: "attraction" as const, lat: "29.9753", lng: "31.1376" },
      { dayNum: 2, title: "午餐 - 當地餐廳", location: "吉薩", startTime: "13:30", endTime: "14:30", category: "food" as const },
      { dayNum: 3, title: "埃及博物館", location: "解放廣場，開羅", startTime: "09:00", endTime: "13:00", category: "attraction" as const, lat: "30.0478", lng: "31.2336" },
      { dayNum: 3, title: "汗哈利利市集購物", location: "開羅舊城", startTime: "15:00", endTime: "18:00", category: "shopping" as const },
      { dayNum: 4, title: "飛往盧克索", location: "開羅機場", startTime: "07:00", endTime: "08:30", category: "transport" as const, notes: "航班 MS 210" },
      { dayNum: 5, title: "帝王谷", location: "盧克索西岸", startTime: "07:00", endTime: "12:00", category: "attraction" as const, lat: "25.7402", lng: "32.6014" },
      { dayNum: 5, title: "哈特謝普蘇特神廟", location: "盧克索西岸", startTime: "12:30", endTime: "14:00", category: "attraction" as const },
      { dayNum: 6, title: "卡納克神廟", location: "盧克索東岸", startTime: "08:00", endTime: "11:00", category: "attraction" as const, lat: "25.7188", lng: "32.6573" },
      { dayNum: 6, title: "盧克索神廟", location: "盧克索市中心", startTime: "16:00", endTime: "18:00", category: "attraction" as const },
      { dayNum: 7, title: "費萊神廟", location: "亞斯文", startTime: "09:00", endTime: "12:00", category: "attraction" as const, lat: "24.0242", lng: "32.8839" },
      { dayNum: 7, title: "尼羅河遊船晚餐", location: "亞斯文", startTime: "19:00", endTime: "21:00", category: "food" as const },
      { dayNum: 8, title: "返回開羅", location: "亞斯文機場", startTime: "10:00", category: "transport" as const },
    ];

    for (let i = 0; i < demoActivities.length; i++) {
      const a = demoActivities[i];
      await db.createActivity({
        dayId: dayIds[a.dayNum],
        tripId: trip.id,
        title: a.title,
        location: a.location,
        startTime: a.startTime,
        endTime: a.endTime,
        category: a.category,
        notes: a.notes,
        lat: a.lat,
        lng: a.lng,
        sortOrder: i,
      });
    }

    // Demo expenses
    const demoExpenses = [
      { title: "機票（來回）", amount: "8500", currency: "HKD", category: "transport" as const, paidByName: ctx.user.name ?? "你", date: "2026-03-10" },
      { title: "酒店住宿（8晚）", amount: "12000", currency: "EGP", category: "accommodation" as const, paidByName: "Alice Chen", date: "2026-03-10" },
      { title: "金字塔門票", amount: "400", currency: "EGP", category: "attraction" as const, paidByName: ctx.user.name ?? "你", date: "2026-03-11" },
      { title: "午餐", amount: "150", currency: "EGP", category: "food" as const, paidByName: "Bob Wong", date: "2026-03-11" },
      { title: "博物館門票", amount: "300", currency: "EGP", category: "attraction" as const, paidByName: ctx.user.name ?? "你", date: "2026-03-12" },
      { title: "市集購物", amount: "500", currency: "EGP", category: "shopping" as const, paidByName: "Alice Chen", date: "2026-03-12" },
      { title: "國內航班", amount: "1200", currency: "EGP", category: "transport" as const, paidByName: ctx.user.name ?? "你", date: "2026-03-13" },
      { title: "晚餐遊船", amount: "600", currency: "EGP", category: "food" as const, paidByName: "Bob Wong", date: "2026-03-16" },
    ];

    for (const e of demoExpenses) {
      await db.createExpense({ tripId: trip.id, ...e, splitAmong: [] });
    }

    // Demo map pins
    const demoPins = [
      { title: "吉薩金字塔", lat: "29.9792", lng: "31.1342", type: "attraction" as const },
      { title: "埃及博物館", lat: "30.0478", lng: "31.2336", type: "attraction" as const },
      { title: "Marriott Mena House", lat: "29.9865", lng: "31.1307", type: "hotel" as const },
      { title: "帝王谷", lat: "25.7402", lng: "32.6014", type: "attraction" as const },
      { title: "卡納克神廟", lat: "25.7188", lng: "32.6573", type: "attraction" as const },
      { title: "費萊神廟", lat: "24.0242", lng: "32.8839", type: "attraction" as const },
    ];

    for (const p of demoPins) {
      await db.createMapPin({ tripId: trip.id, ...p });
    }

    // Demo flights
    await db.createFlight({
      tripId: trip.id,
      flightNumber: "MS 965",
      airline: "EgyptAir",
      departureAirport: "HKG",
      arrivalAirport: "CAI",
      departureDate: "2026-03-10", departureTime: "06:00",
      arrivalDate: "2026-03-10", arrivalTime: "13:00", type: "outbound",
      isReturn: false,
    });
    await db.createFlight({
      tripId: trip.id,
      flightNumber: "MS 966",
      airline: "EgyptAir",
      departureAirport: "CAI",
      arrivalAirport: "HKG",
      departureDate: "2026-03-17", departureTime: "14:00",
      arrivalDate: "2026-03-18", arrivalTime: "06:00", type: "return",
      isReturn: true,
    });

    // Demo accommodation
    await db.createAccommodation({
      tripId: trip.id,
      name: "Marriott Mena House",
      address: "6 Pyramids Road, Giza, Egypt",
      checkIn: "2026-03-10",
      checkOut: "2026-03-13",
      confirmationNumber: "MH2026-001",
      lat: "29.9865",
      lng: "31.1307",
    });

    return { alreadyExists: false, tripId: trip.id };
  }),
});

// ─── Members Router ───────────────────────────────────────────────────────────
const membersRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      return db.getTripMembers(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      name: z.string().min(1),
      email: z.string().email().optional(),
      role: z.enum(["owner", "editor", "viewer"]).default("viewer"),
    }))
    .mutation(async ({ ctx, input }) => {
      const myRole = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!myRole || myRole === "viewer") throw new Error("Permission denied");
      const member = await db.addTripMember({ ...input });
      await db.notifyTripMembers(input.tripId, ctx.user.id, "member_joined", "新成員加入", `${input.name} 已加入行程`);
      return member;
    }),

  updateRole: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      tripId: z.number(),
      role: z.enum(["owner", "editor", "viewer"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const myRole = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (myRole !== "owner") throw new Error("Only owner can change roles");
      await db.updateTripMember(input.memberId, { role: input.role });
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const myRole = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!myRole || myRole === "viewer") throw new Error("Permission denied");
      await db.removeTripMember(input.memberId);
      await db.notifyTripMembers(input.tripId, ctx.user.id, "member_left", "成員已離開", "一位成員已離開行程");
      return { success: true };
    }),
});

// ─── Itinerary Router ─────────────────────────────────────────────────────────
const itineraryRouter = router({
  getDays: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      const days = await db.getItineraryDays(input.tripId);
      const result = await Promise.all(
        days.map(async (day) => ({
          ...day,
          activities: await db.getActivitiesByDay(day.id),
        }))
      );
      return result;
    }),

  updateDay: protectedProcedure
    .input(z.object({
      dayId: z.number(),
      tripId: z.number(),
      title: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      const { dayId, tripId, ...data } = input;
      await db.updateItineraryDay(dayId, data);
      return { success: true };
    }),

  addActivity: protectedProcedure
    .input(z.object({
      dayId: z.number(),
      tripId: z.number(),
      title: z.string().min(1),
      location: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      notes: z.string().optional(),
      category: z.enum(["transport", "accommodation", "food", "attraction", "shopping", "other"]).default("other"),
      sortOrder: z.number().default(0),
      lat: z.string().optional(),
      lng: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      const activity = await db.createActivity(input);
      await db.notifyTripMembers(input.tripId, ctx.user.id, "itinerary_updated", "行程已更新", `${ctx.user.name ?? "成員"} 新增了活動：${input.title}`);
      return activity;
    }),

  updateActivity: protectedProcedure
    .input(z.object({
      activityId: z.number(),
      tripId: z.number(),
      title: z.string().optional(),
      location: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      notes: z.string().optional(),
      category: z.enum(["transport", "accommodation", "food", "attraction", "shopping", "other"]).optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      const { activityId, tripId, ...data } = input;
      await db.updateActivity(activityId, data);
      return { success: true };
    }),

  deleteActivity: protectedProcedure
    .input(z.object({ activityId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      await db.deleteActivity(input.activityId);
      return { success: true };
    }),
});

// ─── Expenses Router ──────────────────────────────────────────────────────────
const expensesRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      return db.getTripExpenses(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      title: z.string().min(1),
      amount: z.string(),
      currency: z.string(),
      category: z.enum(["transport", "accommodation", "food", "attraction", "shopping", "other"]).default("other"),
      paidByName: z.string().optional(),
      paidBy: z.number().optional(),
      splitAmong: z.array(z.number()).default([]),
      date: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      const expense = await db.createExpense(input);
      await db.notifyTripMembers(input.tripId, ctx.user.id, "expense_added", "新增費用", `${ctx.user.name ?? "成員"} 新增了費用：${input.title} (${input.amount} ${input.currency})`);
      return expense;
    }),

  update: protectedProcedure
    .input(z.object({
      expenseId: z.number(),
      tripId: z.number(),
      title: z.string().optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      category: z.enum(["transport", "accommodation", "food", "attraction", "shopping", "other"]).optional(),
      paidByName: z.string().optional(),
      date: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      const { expenseId, tripId, ...data } = input;
      await db.updateExpense(expenseId, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ expenseId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      await db.deleteExpense(input.expenseId);
      return { success: true };
    }),
});

// ─── Map Router ───────────────────────────────────────────────────────────────
const mapRouter = router({
  getPins: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      return db.getMapPins(input.tripId);
    }),

  addPin: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      lat: z.string(),
      lng: z.string(),
      type: z.enum(["attraction", "hotel", "restaurant", "transport", "other"]).default("attraction"),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      return db.createMapPin(input);
    }),

  updatePin: protectedProcedure
    .input(z.object({
      pinId: z.number(),
      tripId: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(["attraction", "hotel", "restaurant", "transport", "other"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      const { pinId, tripId, ...data } = input;
      await db.updateMapPin(pinId, data);
      return { success: true };
    }),

  deletePin: protectedProcedure
    .input(z.object({ pinId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      await db.deleteMapPin(input.pinId);
      return { success: true };
    }),
});

// ─── Flights Router ───────────────────────────────────────────────────────────
const flightsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      return db.getTripFlights(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      flightNumber: z.string().min(1),
      airline: z.string().optional(),
      departureAirport: z.string().min(1),
      arrivalAirport: z.string().min(1),
      departureTime: z.string().optional(),
      arrivalTime: z.string().optional(),
      departureDate: z.string().optional(),
      arrivalDate: z.string().optional(),
      type: z.enum(["outbound", "return", "connecting"]).default("outbound"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      return db.createFlight({ ...input, isReturn: input.type === "return" });
    }),

  delete: protectedProcedure
    .input(z.object({ flightId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      await db.deleteFlight(input.flightId);
      return { success: true };
    }),
});

// ─── Hotels Router ────────────────────────────────────────────────────────────
const hotelsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role) throw new Error("Access denied");
      return db.getTripAccommodations(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      name: z.string().min(1),
      address: z.string().optional(),
      checkIn: z.string().min(1),
      checkOut: z.string().min(1),
      confirmationNumber: z.string().optional(),
      notes: z.string().optional(),
      lat: z.string().optional(),
      lng: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      return db.createAccommodation(input);
    }),

  delete: protectedProcedure
    .input(z.object({ hotelId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const role = await db.getUserTripRole(input.tripId, ctx.user.id);
      if (!role || role === "viewer") throw new Error("Permission denied");
      await db.deleteAccommodation(input.hotelId);
      return { success: true };
    }),
});

// ─── AI Router ────────────────────────────────────────────────────────────────
const aiRouter = router({
  suggestActivities: protectedProcedure
    .input(z.object({
      destination: z.string(),
      date: z.string(),
      dayNumber: z.number(),
      existingActivities: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是一位專業旅遊規劃師，精通全球旅遊目的地。請用繁體中文回應，提供具體、實用的旅遊建議。`,
          },
          {
            role: "user",
            content: `目的地：${input.destination}
日期：${input.date}（第 ${input.dayNumber} 天）
已有活動：${input.existingActivities.join(", ") || "無"}

請推薦 5 個適合這天的活動，包括景點、餐廳或體驗。每個活動請提供：
1. 活動名稱
2. 建議時間（開始-結束）
3. 地點
4. 類別（transport/accommodation/food/attraction/shopping/other）
5. 簡短說明（1-2句）

以 JSON 陣列格式回應，每個物件包含 title, startTime, endTime, location, category, notes 欄位。`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "activity_suggestions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                activities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      startTime: { type: "string" },
                      endTime: { type: "string" },
                      location: { type: "string" },
                      category: { type: "string" },
                      notes: { type: "string" },
                    },
                    required: ["title", "startTime", "endTime", "location", "category", "notes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["activities"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message?.content;
      if (typeof content !== "string") return { activities: [] };
      if (!content) return { activities: [] };
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch {
        return { activities: [] };
      }
    }),

  chat: protectedProcedure
    .input(z.object({
      message: z.string(),
      destination: z.string().optional(),
      context: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `你是 WanderPlan 的 AI 旅遊助手，專門幫助用戶規劃旅行。請用繁體中文回應，提供具體、實用的建議。${input.destination ? `目前規劃目的地：${input.destination}。` : ""}${input.context ? `行程背景：${input.context}` : ""}`,
          },
          { role: "user", content: input.message },
        ],
      });
      const replyContent = response.choices[0]?.message?.content;
      return { reply: typeof replyContent === "string" ? replyContent : "抱歉，我暫時無法回應。" };
    }),
});

// ─── Notifications Router ─────────────────────────────────────────────────────
const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserNotifications(ctx.user.id);
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return db.getUnreadNotificationCount(ctx.user.id);
  }),

  markRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db.markNotificationsRead(ctx.user.id);
    return { success: true };
  }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  trips: tripsRouter,
  members: membersRouter,
  itinerary: itineraryRouter,
  expenses: expensesRouter,
  map: mapRouter,
  flights: flightsRouter,
  hotels: hotelsRouter,
  ai: aiRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
