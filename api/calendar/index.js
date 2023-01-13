var express = require('express')

var router = express.Router()
var multer = require('multer');
const uuidv1 = require('uuid/v1');
const moment = require('moment')


var combos =  multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/combos')
    },
    filename: function (req, file, cb) {
      var fileExtension = file.mimetype.split('/')[1];
      cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      // cb(null, `${file.originalname}`)
    }
  })
})


var controller = require('./calendar.controller')

const {verifyToken} = require('../../config/token');

router.post('/combos', verifyToken, combos.array('images'), controller.ComboCalendar)
router.post('/getCombos', verifyToken, controller.GetComboOffers)
router.post('/updateCombos', verifyToken, combos.array('images'), controller.UpdateComboOffer)
router.post('/removeImages', verifyToken, controller.removeImagesFromCombo);

module.exports = router;
