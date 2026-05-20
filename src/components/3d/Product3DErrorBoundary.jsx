import React from "react";

export default class Product3DErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (
      previousProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="product-3d-fallback">
          <strong>Modèle 3D non lisible</strong>
          <span>Réimporte un fichier .glb ou .gltf valide.</span>
        </div>
      );
    }

    return this.props.children;
  }
}