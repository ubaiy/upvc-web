import Konva from 'konva';

export class WindowFrame {
  partitions: Partition[];

  constructor(partitionRects: Konva.Rect[]) {
    this.partitions = partitionRects.map((rect) => new Partition(rect));
    this.redistributeSpace();
  }

  resizePartition(rect: Konva.Rect, newSize: PartitionSize) {
    const partition = this.getPartitionByRect(rect);
    if (partition) {
      partition.resize(newSize);
      this.redistributeSpace();
    }
  }

  redistributeSpace() {
    const totalArea = this.getTotalArea();
    const numPartitions = this.partitions.length;
    const averageArea = totalArea / numPartitions;

    // Calculate the total of the adjusted sizes
    const totalAdjustedArea = this.partitions.reduce(
      (acc, partition) => acc + partition.adjacentArea(),
      0
    );

    // Distribute the remaining space proportionally among the partitions
    this.partitions.forEach((partition) => {
      const proportionalArea =
        (partition.adjacentArea() / totalAdjustedArea) * totalArea;
      const scaleFactor = Math.sqrt(
        proportionalArea / partition.adjacentArea()
      ); // Scale factor to maintain aspect ratio
      const newHeight = partition.adjacentSize.height * scaleFactor;
      const newWidth = partition.adjacentSize.width * scaleFactor;
      partition.resize({ height: newHeight, width: newWidth });
    });
  }

  getTotalArea(): number {
    return this.partitions.reduce(
      (acc, partition) => acc + partition.area(),
      0
    );
  }

  getPartitionByRect(rect: Konva.Rect): Partition | undefined {
    return this.partitions.find((partition) => partition.rect === rect);
  }
}

export class Partition {
  rect: Konva.Rect;
  size: PartitionSize;
  adjacentSize: PartitionSize;

  constructor(rect: Konva.Rect) {
    this.rect = rect;
    this.size = { height: rect.height(), width: rect.width() };
    this.adjacentSize = { height: rect.height(), width: rect.width() };
  }

  resize(newSize: PartitionSize) {
    this.size = newSize;
  }

  adjacentArea(): number {
    return this.adjacentSize.height * this.adjacentSize.width;
  }

  area(): number {
    return this.size.height * this.size.width;
  }
}

interface PartitionSize {
  height: number;
  width: number;
}
