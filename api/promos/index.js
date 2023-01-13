var express = require('express')

var router = express.Router()
var multer = require('multer');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
const fs = require('fs')

var upload =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {

        if (!fs.existsSync('public/promos')){
          fs.mkdirSync('public/promos');
        }
        cb(null, 'public/promos')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var controller = require('./promos.controller')

const {verifyToken} = require('../../config/token');

router.post('/create', verifyToken, upload.single('image'), controller.CreatePromo)
router.post('/update', verifyToken, upload.single('image'), controller.UpdatePromo)
router.post('/getAll', verifyToken, controller.GetPromos)

module.exports = router;
