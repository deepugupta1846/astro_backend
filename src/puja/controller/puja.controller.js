const db = require("../../../models");
const Puja = db.puja;
const PujaBooking = db.pujaBooking;
const User = db.user;
const { insertNotification } = require("../../notifications/notification.service");

function toPujaResponse(row) {
  const p = row.toJSON ? row.toJSON() : row;
  ["tags", "benefits"].forEach((key) => {
    if (p[key] && typeof p[key] === "string") {
      try {
        p[key] = JSON.parse(p[key]);
      } catch {
        p[key] = [];
      }
    }
  });
  return p;
}

/**
 * GET /api/v1/pujas
 */
exports.listActivePujas = async (_req, res) => {
  try {
    const rows = await Puja.findAll({
      where: { isActive: true },
      order: [
        ["priority", "DESC"],
        ["id", "DESC"],
      ],
    });
    return res.status(200).json({
      success: true,
      data: rows.map((r) => toPujaResponse(r)),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error listing pujas",
    });
  }
};

/**
 * POST /api/v1/pujas/book
 * Body: {
 *   pujaId, userId?, name, phone, email?, city?,
 *   preferredDate?, preferredTime?, notes?
 * }
 */
exports.bookPuja = async (req, res) => {
  try {
    const pujaId = parseInt(req.body?.pujaId, 10);
    const userIdRaw = req.body?.userId;
    const userId =
      userIdRaw == null || userIdRaw === "" ? null : parseInt(userIdRaw, 10);
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const email =
      req.body?.email != null && String(req.body.email).trim()
        ? String(req.body.email).trim()
        : null;
    const city =
      req.body?.city != null && String(req.body.city).trim()
        ? String(req.body.city).trim()
        : null;
    const preferredTime =
      req.body?.preferredTime != null && String(req.body.preferredTime).trim()
        ? String(req.body.preferredTime).trim()
        : null;

    if (!pujaId || !name || !phone) {
      return res.status(400).json({
        success: false,
        message: "pujaId, name, and phone are required",
      });
    }

    const puja = await Puja.findByPk(pujaId);
    if (!puja || !puja.isActive) {
      return res.status(404).json({
        success: false,
        message: "Puja not found",
      });
    }

    const booking = await PujaBooking.create({
      pujaId,
      userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      name: name.slice(0, 120),
      phone: phone.slice(0, 25),
      email: email ? email.slice(0, 180) : null,
      city: city ? city.slice(0, 120) : null,
      preferredDate:
        req.body?.preferredDate != null && String(req.body.preferredDate).trim()
          ? String(req.body.preferredDate).trim()
          : null,
      preferredTime: preferredTime ? preferredTime.slice(0, 40) : null,
      notes:
        req.body?.notes != null && String(req.body.notes).trim()
          ? String(req.body.notes).trim()
          : null,
      amount: puja.price || 0,
      status: "pending",
    });

    // Notify all admins that a new puja booking has been created.
    try {
      const admins = await User.findAll({
        where: { role: "admin", isActive: true },
        attributes: ["id"],
      });
      await Promise.all(
        admins.map((admin) =>
          insertNotification({
            userId: admin.id,
            title: "New Puja Booking",
            body: `${booking.name} requested ${puja.title || "a puja"}`,
            payload: {
              type: "puja_booking",
              bookingId: String(booking.id),
              pujaId: String(booking.pujaId),
              customerName: booking.name,
              customerPhone: booking.phone,
            },
          })
        )
      );
    } catch (_) {
      // Ignore notification failures; booking should still succeed.
    }

    return res.status(201).json({
      success: true,
      message: "Puja booking created",
      data: {
        id: booking.id,
        pujaId: booking.pujaId,
        name: booking.name,
        phone: booking.phone,
        email: booking.email,
        city: booking.city,
        preferredDate: booking.preferredDate,
        preferredTime: booking.preferredTime,
        amount: booking.amount,
        status: booking.status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error booking puja",
    });
  }
};
