import OrbitalNode from './OrbitalNode';
import styles from './GalaxyCluster.module.css';

/**
 * GalaxyCluster — visual grouping of related orbital nodes.
 *
 * Requirements 12.5, 15.2, 15.3:
 *   - Nodes orbit a common focal point
 *   - Labeled above the focal point (font-size >= 14px)
 *   - Dashed orbit ring visually distinguishes clusters
 *   - Pure CSS orbital rotation keeps rendering performant
 */
export default function GalaxyCluster({
  name,
  nodes,
  focalPoint,
  scales,
  selectedZone,
  onNodeClick,
}) {
  return (
    <div
      className={styles.clusterContainer}
      style={{
        left: focalPoint.x,
        top: focalPoint.y,
      }}
    >
      {/* Cluster label positioned above the focal point */}
      <div className={styles.label}>{name}</div>

      {/* Orbit ring visual guide */}
      <div className={styles.orbitRing} />

      {/* Spin container handles the orbital rotation */}
      <div className={styles.spinContainer}>
        {nodes.map((node, i) => {
          const baseAngle = (360 / nodes.length) * i;
          // Positioning offset via CSS rotation + translate
          const placementStyle = {
            transform: `rotate(${baseAngle}deg) translate(95px) rotate(${-baseAngle}deg)`,
          };

          return (
            <div
              key={node.id}
              className={styles.nodeWrapper}
              style={placementStyle}
            >
              {/* Counter-rotation to keep the node content upright */}
              <div className={styles.nodeCounter}>
                <OrbitalNode
                  zone={node}
                  position={{ x: 0, y: 0 }} // Position is driven by parent CSS wrapper
                  scale={scales[node.id] || 1}
                  isSelected={selectedZone?.id === node.id}
                  onClick={onNodeClick}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
