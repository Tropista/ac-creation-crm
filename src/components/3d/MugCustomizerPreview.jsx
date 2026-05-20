export default function MugCustomizerPreview({
  designImage,
  designSize = 1,
  designX = 0,
  designY = 0
}) {
  return (
    <div className="mug-customizer-preview">
      <div className="mug-mockup">
        <div className="mug-body">
          <div className="mug-shine" />

          <div className="mug-print-zone">
            {designImage ? (
              <img
                className="mug-print-image"
                src={designImage}
                alt="Visuel personnalisé"
                style={{
                  width: `${180 * Number(designSize || 1)}px`,
                  transform: `translate(calc(-50% + ${
                    Number(designX || 0) * 110
                  }px), calc(-50% + ${
                    Number(designY || 0) * -110
                  }px))`,
                }}
              />
            ) : (
              <div className="mug-empty-zone">
                Ajoutez une image
              </div>
            )}
          </div>
        </div>

        <div className="mug-handle" />
      </div>

      <p className="mug-preview-note">
        Aperçu de la zone d’impression du mug
      </p>
    </div>
  );
}