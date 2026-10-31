import { Typography, List, ListItem, ListItemText } from '@mui/material';

const Review = ({ checkoutToken }) => (
  <>
    <Typography variant="h6" gutterBottom>Order summary</Typography>
    <List disablePadding>
      {checkoutToken.live.line_items.map((product) => (
        <ListItem sx={{ py: 1.25, px: 0 }} key={product.id}>
          <ListItemText primary={product.name} secondary={`Quantity: ${product.quantity}`} />
          <Typography variant="body2">{product.line_total.formatted_with_symbol}</Typography>
        </ListItem>
      ))}
      <ListItem sx={{ py: 1.25, px: 0 }}>
        <ListItemText primary="Subtotal" />
        <Typography variant="body2">{checkoutToken.live.subtotal.formatted_with_symbol}</Typography>
      </ListItem>
      <ListItem sx={{ py: 1.25, px: 0 }}>
        <ListItemText primary="Shipping" />
        <Typography variant="body2">{checkoutToken.live.shipping.price.formatted_with_symbol}</Typography>
      </ListItem>
      {checkoutToken.live.tax?.amount && (
        <ListItem sx={{ py: 1.25, px: 0 }}>
          <ListItemText primary={checkoutToken.live.tax.included_in_price ? 'Tax (included)' : 'Tax'} />
          <Typography variant="body2">{checkoutToken.live.tax.amount.formatted_with_symbol}</Typography>
        </ListItem>
      )}
      <ListItem sx={{ py: 1.25, px: 0 }}>
        <ListItemText primary="Total" />
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {checkoutToken.live.total_with_tax.formatted_with_symbol}
        </Typography>
      </ListItem>
    </List>
  </>
);
export default Review;
