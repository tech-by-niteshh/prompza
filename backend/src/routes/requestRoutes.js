const express = require("express");
const { submitRequest } = require("../controllers/requestController");

const router = express.Router();

router.post("/submit-request", submitRequest);

module.exports = router;
