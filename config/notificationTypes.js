

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
}

const NOTIFICATION_MESSAGE = {
    EVENT_USER_JOIN : (eventName='') => `User joined event: ${eventName || ''}`,
    EVENT_USER_LEAVE: (eventName='') => `User leave event: ${eventName || ''}`,
}

module.exports = {
    NOTIFICATION_TYPES,
    NOTIFICATION_TITLES,
    NOTIFICATION_MESSAGE,
}