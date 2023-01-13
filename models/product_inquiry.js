module.exports = (sequelize, DataTypes) => {
    const ProductInquiry = sequelize.define('product_inquiry', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: DataTypes.INTEGER,
      },
      business_id: {
        type: DataTypes.INTEGER,
      },
      user_id: {
        type: DataTypes.INTEGER,
      },
      type: {
        type: DataTypes.INTEGER,
        defaultValue: 1     //1 - inquiry, 2 - booking
      },
      date: DataTypes.DATEONLY,
      time: DataTypes.TIME,
      name: DataTypes.STRING,
      email: DataTypes.STRING,
      phone: DataTypes.STRING,
      address: DataTypes.TEXT,
      latitude: DataTypes.DOUBLE,
      longitude: DataTypes.DOUBLE,
      message: DataTypes.TEXT,
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      is_read: {
		  type: DataTypes.BOOLEAN,
		  defaultValue: false
    },
    chat_init: {
		type: DataTypes.BOOLEAN,
		defaultValue: false
	}, 
    }, {
      // timestamps: false
    });
    ProductInquiry.associate = function(models) {
      // associations can be defined here
      ProductInquiry.belongsTo(models.business, {foreignKey: 'business_id'})
      ProductInquiry.belongsTo(models.user, {foreignKey: 'user_id'})
    };
    return ProductInquiry;
  };