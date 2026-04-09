from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_db
from src.models.incident import Incident, TriageResultModel

router = APIRouter()


@router.get("/")
async def get_metrics(db: AsyncSession = Depends(get_db)):
    # Total incidents by status
    status_result = await db.execute(
        select(Incident.status, func.count(Incident.id)).group_by(Incident.status)
    )
    status_counts = dict(status_result.all())

    # Severity distribution
    severity_result = await db.execute(
        select(TriageResultModel.severity, func.count(TriageResultModel.id))
        .group_by(TriageResultModel.severity)
    )
    severity_counts = dict(severity_result.all())

    # Average confidence
    confidence_result = await db.execute(
        select(func.avg(TriageResultModel.confidence))
    )
    avg_confidence = confidence_result.scalar() or 0.0

    # Total counts
    total_result = await db.execute(select(func.count(Incident.id)))
    total = total_result.scalar() or 0

    resolved_count = status_counts.get("resolved", 0)
    failed_count = status_counts.get("failed", 0)

    # Affected components distribution (extracted from description prefix)
    desc_result = await db.execute(select(Incident.description))
    component_counts: dict[str, int] = {}
    for (desc,) in desc_result.all():
        if desc and desc.startswith("[Affected Area: "):
            area = desc.split("]")[0].replace("[Affected Area: ", "")
            component_counts[area] = component_counts.get(area, 0) + 1

    return {
        "total_incidents": total,
        "status_distribution": status_counts,
        "severity_distribution": severity_counts,
        "component_distribution": component_counts,
        "average_confidence": round(float(avg_confidence), 3),
        "resolution_rate": round(resolved_count / total, 3) if total > 0 else 0.0,
        "failure_rate": round(failed_count / total, 3) if total > 0 else 0.0,
    }
