const express = require('express')
const router = express.Router()
const controller = require('./country.controller')
const {verifyToken} = require('../../config/token');
const {authorize} = require('../../helpers/authorize');


// Countries Routes
router.post('/list',controller.countryList)

module.exports = router;
