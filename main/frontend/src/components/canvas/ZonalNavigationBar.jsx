import { useState, useEffect } from 'react';
import styles from './ZonalNavigationBar.module.css';

/**
 * ZonalNavigationBar — floating glass navigation and filter bar.
 *
 * Requirements 12.8, Property 40:
 *   - Fixed at the top of the canvas viewport
 *   - Zone Search input, debounced 300 ms
 *   - Filter tags: Active, Muted, Friends
 *   - Applies filter predicate to visible OrbitalNodes
 */
export default function ZonalNavigationBar({
  searchQuery,
  onSearchChange,
  selectedFilter,
  onFilterChange,
}) {
  const [localSearch, setLocalSearch] = useState(searchQuery || '');

  // Debounce search input by 300 ms
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, onSearchChange]);

  const handleFilterClick = (filter) => {
    // Toggle filter: click active filter again to clear it
    if (selectedFilter === filter) {
      onFilterChange(null);
    } else {
      onFilterChange(filter);
    }
  };

  return (
    <div className={`${styles.navBar} glass-panel`}>
      <div className={styles.searchWrapper}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          type="text"
          className={styles.searchInput}
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Filter orbital nodes..."
        />
      </div>

      <div className={styles.filtersWrapper}>
        {['Active', 'Muted', 'Friends'].map((tag) => {
          const isActive = selectedFilter === tag;
          return (
            <button
              key={tag}
              type="button"
              className={`${styles.filterTag} ${isActive ? styles.activeTag : ''}`}
              onClick={() => handleFilterClick(tag)}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
