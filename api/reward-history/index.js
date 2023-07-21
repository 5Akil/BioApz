const express = require('express');
const router = express.Router();
const controller = require('./reward-history.controller');
const { authorize } = require('../../helpers/authorize');


router.post('/list', authorize([2]), controller.rewardHistoryList);

module.exports = router;
