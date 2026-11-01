export const createOrderData = (checkoutToken, shippingData, payment) => ({
  line_items: checkoutToken.live.line_items,
  customer: { firstname: shippingData.firstName, lastname: shippingData.lastName, email: shippingData.email },
  shipping: {
    name: `${shippingData.firstName} ${shippingData.lastName}`,
    street: shippingData.address1,
    town_city: shippingData.city,
    county_state: shippingData.shippingSubdivision,
    postal_zip_code: shippingData.zip,
    country: shippingData.shippingCountry,
  },
  fulfillment: { shipping_method: shippingData.shippingOption },
  payment,
});
