'use strict';
module.exports = (sequelize, DataTypes) => {
  const UserEvents = sequelize.define('user_events', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.INTEGER,
    },
    event_id: {
      type: DataTypes.INTEGER,
    },
    user_id: {
      type: DataTypes.INTEGER,
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    // timestamps: false
  });
  UserEvents.associate = function (models) {
    // associations can be defined here
    UserEvents.belongsTo(models.business, { foreignKey: 'business_id' })
    UserEvents.belongsTo(models.combo_calendar, {foreignKey: 'event_id'})
    UserEvents.belongsTo(models.user, {foreignKey: 'user_id' })
  };
  return UserEvents;
};