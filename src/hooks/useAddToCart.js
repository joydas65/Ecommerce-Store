'use client';

import { useRef, useState } from 'react';

export default function useAddToCart(onAddToCart, isUpdating) {
  const activeAdd = useRef(false);
  const lastAddButton = useRef(null);
  const [addingId, setAddingId] = useState(null);
  const [added, setAdded] = useState(null);
  const [unexpectedError, setUnexpectedError] = useState('');

  const addProduct = async (product, button) => {
    if (activeAdd.current || isUpdating) return;
    activeAdd.current = true;
    lastAddButton.current = button;
    setAddingId(product.id);
    setAdded(null);
    setUnexpectedError('');
    try {
      const result = await onAddToCart(product.id, 1);
      if (result?.status === 'success') setAdded(product.name);
    } catch {
      setUnexpectedError('Your cart could not be updated. Please try again.');
    } finally {
      activeAdd.current = false;
      setAddingId(null);
    }
  };

  const dismiss = () => {
    setAdded(null);
    lastAddButton.current?.focus();
  };

  return { addProduct, addingId, added, unexpectedError, dismiss };
}
