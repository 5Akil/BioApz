

const NOTIFICATION_TYPES = {
    EVENT_USER_JOIN : "event_user_join",
    EVENT_USER_LEAVE: "event_user_leave",
    GIFT_CARD_PURCHASE: "gift_card_purchase",
    GIFT_CARD_SHARE : "gift_card_share",
    PLACE_ORDER: "place_order",
    ORDER_DELIVERED: "order_delivered",
    DISCOUNT_USE: "discount_use",
    LOYALTY_USE: "loyalty_point_use",
};

const NOTIFICATION_TITLES = {
    EVENT_USER_JOIN : () => `User Joined Event`,
    EVENT_USER_LEAVE: () => `User Leaved Event`,
    GIFT_CARD_PURCHASE: () => `User Purchased Virtual Card`,
    GIFT_CARD_SHARE: (username='') => `${username} Sent you B.a.s.e Virtual card !`,
    PLACE_ORDER_USER: () => `Order Placed`,
    PLACE_ORDER_BUSINESS: () => `User Placed Order`,
    ORDER_DELIVERED_USER: () => `Order Delivered`,
    ORDER_DELIVERED_BUSINESS: () => `Order Delivered`,
    GET_DISCOUNT_ORDER: () => `User Get Discount`,
    GET_LOYALTY_POINT_USER: () => `Loyalty points on order`,
    GET_LOYALTY_POINT_BUSINESS: () => `Loyalty points on order`,
}

const NOTIFICATION_MESSAGE = {
    EVENT_USER_JOIN : (eventName='',userName='') => `${userName || 'User'} joined ${eventName || 'event'}`,
    EVENT_USER_LEAVE: (eventName='',userName='') => `${userName || 'User'} left ${eventName || 'event'}`,
    GIFT_CARD_PURCHASE: (giftCardName='') => `User Purchased Virtual card : ${giftCardName}`,
    GIFT_CARD_SHARE: (giftCardName='') => `You've received a Virtual card : ${giftCardName}`,
    PLACE_ORDER_USER: (orderNo='') => `Your order ${orderNo} is successfully placed!`,
    PLACE_ORDER_BUSINESS: (orderNo='') => `User Placed Order ${orderNo}`,
    ORDER_DELIVERED_USER: (orderNo='') => `Your Order ${orderNo} delivered successfully!`,
    ORDER_DELIVERED_BUSINESS: (orderNo= '') => `Order ${orderNo} Completed `,
    GET_DISCOUNT_ORDER: (orderNo='') => `User get discount on order ${orderNo}`,
    GET_LOYALTY_POINT_USER: (orderNo='') => `You received loyalty points on order ${orderNo}`,
    GET_LOYALTY_POINT_BUSINESS: (orderNo='') => `User received loyalty points on order ${orderNo}`,
}

module.exports = {
    NOTIFICATION_TYPES,
    NOTIFICATION_TITLES,
    NOTIFICATION_MESSAGE,
}