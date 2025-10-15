// src/DropdownMenu.js
import React from 'react';
import styles from './DropdownMenu.module.css';

export default function DropdownMenu({ children }) {
  return (
    <div className={styles.menu}>
      {children}
    </div>
  );
}