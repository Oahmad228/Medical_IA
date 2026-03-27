import React from "react";
import { indicatorToChibiImagePrefix } from "../lib/utils";

export default function ChibiStage({ assistant, indicatorLevel, message, hasReport, onOpenReport }) {
  const sev = String(indicatorLevel || "GREEN").toLowerCase();
  const prefix = indicatorToChibiImagePrefix(indicatorLevel);
  const imgSrc = `/chibi/${prefix}${assistant.subject}.png`;

  return (
    <div className={`chibi-stage chibi-stage--${sev}`}>
      <div className="chibi-stage__top">
        <div>
          <p className="chibi-stage__eyebrow">Assistant</p>
          <h2 className="chibi-stage__title">{assistant.label}</h2>
        </div>
        <span className={`chibi-stage__badge chibi-stage__badge--${sev}`}>
          {String(indicatorLevel || "GREEN").toUpperCase()}
        </span>
      </div>

      <div className="chibi-stage__viewport" aria-hidden="true">
        <div className="chibi-stage__aurora" />
        <div className="chibi-stage__mesh" />
        <div className="chibi-stage__orbs">
          <span />
          <span />
          <span />
        </div>
        <div className="chibi-stage__horizon" />
        <div className="chibi-stage__track">
          <div className={`chibi-walker chibi-walker--${sev}`}>
            <div className="chibi-walker__glow" />
            <img key={imgSrc} className="chibi-walker__img" src={imgSrc} alt="" />
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`chibi-stage__bubble ${hasReport ? "chibi-stage__bubble--click" : ""}`}
        onClick={hasReport ? onOpenReport : undefined}
        disabled={!hasReport}
      >
        <span className="chibi-stage__bubble-text">{message}</span>
        {hasReport ? <span className="chibi-stage__bubble-cta">Ouvrir le rapport</span> : null}
      </button>
    </div>
  );
}
