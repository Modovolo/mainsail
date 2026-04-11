"""
Printer Profile Model

Global printer profiles storing machine values (bed volume, extruder count, etc.)
used by the slicer in the Prepare page. These are shared across all users.
"""
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, Text
from models.base import Base


class PrinterProfileModel(Base):
    """Printer profile model - global machine configurations for slicing"""
    __tablename__ = 'printer_profiles'

    id = Column(String(32), primary_key=True)
    name = Column(String(255), nullable=False)
    build_volume_x = Column(Float, nullable=False, default=220)
    build_volume_y = Column(Float, nullable=False, default=220)
    build_volume_z = Column(Float, nullable=False, default=250)
    extruder_count = Column(Integer, nullable=False, default=1)
    nozzle_diameter = Column(Float, nullable=False, default=0.4)
    filament_diameter = Column(Float, nullable=False, default=1.75)
    bed_shape = Column(String(50), nullable=False, default='rectangular')
    heated_bed = Column(Boolean, nullable=False, default=True)
    bed_heater_controller_count = Column(Integer, nullable=False, default=1)
    heated_chamber = Column(Boolean, nullable=False, default=False)
    auto_bed_leveling = Column(Boolean, nullable=False, default=False)
    direct_drive = Column(Boolean, nullable=False, default=False)
    multi_extruder_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


@dataclass
class PrinterProfileData:
    """Printer profile data class"""
    id: str
    name: str
    build_volume_x: float
    build_volume_y: float
    build_volume_z: float
    extruder_count: int
    nozzle_diameter: float
    filament_diameter: float
    bed_shape: str
    heated_bed: bool
    bed_heater_controller_count: int
    heated_chamber: bool
    auto_bed_leveling: bool
    direct_drive: bool
    multi_extruder_type: Optional[str]
    created_at: str
    updated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'buildVolume': {
                'x': self.build_volume_x,
                'y': self.build_volume_y,
                'z': self.build_volume_z,
            },
            'extruderCount': self.extruder_count,
            'nozzleDiameter': self.nozzle_diameter,
            'filamentDiameter': self.filament_diameter,
            'bedShape': self.bed_shape,
            'heatedBed': self.heated_bed,
            'bedHeaterControllerCount': self.bed_heater_controller_count,
            'heatedChamber': self.heated_chamber,
            'autoBedLeveling': self.auto_bed_leveling,
            'directDrive': self.direct_drive,
            'multiExtruderType': self.multi_extruder_type,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
        }

    @staticmethod
    def from_model(model: 'PrinterProfileModel') -> 'PrinterProfileData':
        """Convert PrinterProfileModel to PrinterProfileData"""
        return PrinterProfileData(
            id=model.id,
            name=model.name,
            build_volume_x=model.build_volume_x,
            build_volume_y=model.build_volume_y,
            build_volume_z=model.build_volume_z,
            extruder_count=model.extruder_count,
            nozzle_diameter=model.nozzle_diameter,
            filament_diameter=model.filament_diameter,
            bed_shape=model.bed_shape,
            heated_bed=model.heated_bed,
            bed_heater_controller_count=model.bed_heater_controller_count,
            heated_chamber=model.heated_chamber,
            auto_bed_leveling=model.auto_bed_leveling,
            direct_drive=model.direct_drive,
            multi_extruder_type=model.multi_extruder_type,
            created_at=model.created_at.isoformat() if model.created_at else '',
            updated_at=model.updated_at.isoformat() if model.updated_at else '',
        )
