const express = require('express');
const router = express.Router();
const controller = require('./reward-history.controller');
const { authorize } = require('../../helpers/authorize');


router.post('/list', authorize([2]), controller.rewardHistoryList);
router.post('/business/list', authorize([3]), controller.rewardHistoryBusinessList)
router.post('/perfomance', authorize([3]), controller.rewardPerfomance);

module.exports = router;
