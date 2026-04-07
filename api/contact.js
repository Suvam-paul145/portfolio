require("dotenv").config();

const { handleContactRequest } = require("../lib/contact-service");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  return handleContactRequest(req, res);
};
