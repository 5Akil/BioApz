var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config');

const fileFilter = (req,file,cb) => {

  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png'){
    cb(null,true)
  }else{
    cb(new Error('Invalid image'),false);
  }
}
var awsuploadcombos = multer({
  storage:multerS3({
    fileFilter,
    s3:awsConfig.s3,
    bucket:'bioapz',
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'combos/'+fileName);
    }
  })
})
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

router.post('/combos', verifyToken, awsuploadcombos.array('images'), controller.ComboCalendar)
router.post('/getCombos', verifyToken, controller.GetComboOffers)
router.post('/updateCombos', verifyToken, awsuploadcombos.array('images'), controller.UpdateComboOffer)
router.post('/removeImages', verifyToken, controller.removeImagesFromCombo);

module.exports = router;
