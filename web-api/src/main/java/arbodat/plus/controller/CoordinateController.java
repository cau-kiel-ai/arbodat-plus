package arbodat.plus.controller;

import arbodat.plus.model.Coordinate;
import arbodat.plus.model.Sample;
import arbodat.plus.model.Site;
import arbodat.plus.repository.CoordinateRepository;
import arbodat.plus.repository.SampleRepository;
import arbodat.plus.repository.SiteRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/coordinates")
public class CoordinateController {

    @Autowired
    CoordinateRepository coordinateRepository;

    @Autowired
    SiteRepository siteRepository;

    @Autowired
    SampleRepository sampleRepository;

    @GetMapping
    public List<Coordinate> getAllCoordinates() {
        return coordinateRepository.findAll();
    }

    @PostMapping("/{type}/{id}")
    public String create(@RequestBody  Coordinate coordinate,
                         @PathVariable String type,
                         @PathVariable UUID id) {

        if (type.equals("site")) {
            Site site = siteRepository.findById(id)
                    .orElseThrow(() -> new EntityNotFoundException("invalid site id: " + id));

            site.setCoordinate(coordinate);
            siteRepository.save(site);
        }

        if (type.equals("sample")) {
            Sample sample = sampleRepository.findById(id)
                    .orElseThrow(() -> new EntityNotFoundException("invalid sample id: " + id));

            sample.setCoordinate(coordinate);
            sampleRepository.save(sample);
        }

        return "coordinate is created";
    }
}
