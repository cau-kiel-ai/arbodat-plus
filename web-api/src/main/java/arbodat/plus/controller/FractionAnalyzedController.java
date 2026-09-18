package arbodat.plus.controller;

import arbodat.plus.model.FractionAnalyzed;
import arbodat.plus.repository.FractionAnalyzedRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/fractions_analyzed")
public class FractionAnalyzedController {

    @Autowired
    FractionAnalyzedRepository fractionAnalyzedRepository;

    @GetMapping
    public List<FractionAnalyzed> getAllFractionAnalyzed() {
        return fractionAnalyzedRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody FractionAnalyzed fractionAnalyzed) {

        // Check whether fraction already exists
        Optional<FractionAnalyzed> existingFractionAnalyzed = fractionAnalyzedRepository.
                findAlreadyExisting(fractionAnalyzed.getSample(),
                                    fractionAnalyzed.getFractionAnalyzed(),
                                    fractionAnalyzed.getOrgOrMin(),
                                    fractionAnalyzed.getSieveSize());
        if (existingFractionAnalyzed.isPresent()) {
            return "fractionAnalyzed already exists";
        } else {
            fractionAnalyzedRepository.save(fractionAnalyzed);
            return "fractionAnalyzed is created";
        }
    }
}
