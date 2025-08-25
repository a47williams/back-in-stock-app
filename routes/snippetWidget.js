router.post("/subscribe", async (req, res) => {
  const { shop, productId, phone } = req.body;

  if (!shop || !productId || !phone) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    await Subscriber.create({ shop, productId, phone });

    return res.status(200).json({
      success: true,
      message: "Alert saved",  // Note: message adjusted for clarity
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error subscribing",
    });
  }
});
